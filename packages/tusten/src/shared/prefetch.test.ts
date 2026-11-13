import { describe, expect, it } from 'vitest'
import { runGlobalPrefetch, runPagePrefetch, runPrefetch } from './prefetch'
import { Slice } from '../client/slices/Slice'
import type { FactoryMap, FactoryImplementation, TustenRoute, TustenRouter } from '../types'

/** Слайс для тестов. */
class AnySlice extends Slice<unknown> {}

/**
 * Фабрика-заглушка, возвращает `{ name }`.
 *
 * @param name возвращаемое значение.
 * @param deps зависимости.
 * @returns impl.
 */
function makeImpl(name: unknown, deps?: () => Promise<Record<string, unknown>>): FactoryImplementation {
    return {
        loadData: async (args, depsMap) => ({ name, args, depsMap }),
        slice: AnySlice,
        getDataFactoryArguments: deps,
    }
}

/**
 * In-memory `SliceRegistry` для тестов.
 *
 * @returns объект с методами реестра.
 */
function makeRegistry() {
    const map = new Map<string, unknown>()
    return {
        setPage: (k: string, s: unknown) => map.set(k, s),
        setGlobal: (k: string, s: unknown) => map.set(k, s),
        get: (k: string) => map.get(k),
        size: () => map.size,
    }
}

/**
 * Маршрут с дефолтами.
 *
 * @param deps prefetchConfig.dependencies.
 * @param configLoader spec configLoader.
 * @returns маршрут.
 */
function makeRoute(deps: string[] = [], configLoader = 'Root:getConfig'): TustenRoute {
    return {
        id: 'home',
        metaConfig: { title: 'Home' },
        type: 'main',
        index: true,
        contentConfig: {
            workspaceConfig: { template: 'HomePage/view:View' },
            prefetchConfig: {
                configLoader,
                configParams: {},
                dependencies: deps,
            },
        },
    }
}

/**
 * Роутер-заглушка.
 *
 * @returns роутер.
 */
function makeRouter(): TustenRouter {
    return { id: 'home', path: '/', params: {}, query: {}, request: null }
}

/**
 * Модуль-лоадер: отдаёт impl из карты.
 *
 * @param modules карта `spec → значение`.
 * @returns async loadModule.
 */
function makeLoadModule(modules: Record<string, unknown>): (spec: string) => Promise<unknown> {
    return async (spec) => {
        if (!(spec in modules)) {
            throw new Error(`Module not found: ${spec}`)
        }
        return modules[spec]
    }
}

describe('runGlobalPrefetch', () => {
    it('пустые dependencies — пустой states', async () => {
        const reg = makeRegistry()
        const states = await runGlobalPrefetch({
            route: makeRoute(),
            globalRegistry: {},
            loadModule: makeLoadModule({}),
            registry: reg as never,
            router: makeRouter(),
        })
        expect(states.size).toBe(0)
    })

    it('загружает один global loader', async () => {
        const reg = makeRegistry()
        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'User:userInfoLoader' },
        }
        const states = await runGlobalPrefetch({
            route: makeRoute(['userInfo']),
            globalRegistry,
            loadModule: makeLoadModule({
                'User:userInfoLoader': makeImpl('demo'),
            }),
            registry: reg as never,
            router: makeRouter(),
        })
        expect(states.get('userInfo')).toBeDefined()
        expect(reg.size()).toBe(1)
    })

    it('транзитивные зависимости', async () => {
        const reg = makeRegistry()
        const globalRegistry: FactoryMap = {
            a: { dataFactoryName: 'm:a' },
            b: { dataFactoryName: 'm:b', dependencies: ['a'] },
        }
        const loaded: string[] = []
        const loadModule = async (spec: string) => {
            loaded.push(spec)
            return makeImpl(spec)
        }
        const states = await runGlobalPrefetch({
            route: makeRoute(['b']),
            globalRegistry,
            loadModule,
            registry: reg as never,
            router: makeRouter(),
        })
        expect([...states.keys()].sort()).toEqual(['a', 'b'])
        expect(loaded).toContain('m:a')
        expect(loaded).toContain('m:b')
    })

    it('skipExisting пропускает уже загруженные', async () => {
        const reg = makeRegistry()
        reg.setGlobal('userInfo', { loaded: true })

        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'User:userInfoLoader' },
        }
        const states = await runGlobalPrefetch(
            {
                route: makeRoute(['userInfo']),
                globalRegistry,
                loadModule: makeLoadModule({
                    'User:userInfoLoader': makeImpl('demo'),
                }),
                registry: reg as never,
                router: makeRouter(),
            },
            { skipExisting: true },
        )
        expect(states.size).toBe(0)
    })

    it('бросает на неизвестный global loader', async () => {
        const reg = makeRegistry()
        await expect(
            runGlobalPrefetch({
                route: makeRoute(['ghost']),
                globalRegistry: {},
                loadModule: makeLoadModule({}),
                registry: reg as never,
                router: makeRouter(),
            }),
        ).rejects.toThrow(/not found/)
    })

    it('бросает на цикл в global-зависимостях', async () => {
        const reg = makeRegistry()
        const globalRegistry: FactoryMap = {
            a: { dataFactoryName: 'm:a', dependencies: ['b'] },
            b: { dataFactoryName: 'm:b', dependencies: ['a'] },
        }
        await expect(
            runGlobalPrefetch({
                route: makeRoute(['a']),
                globalRegistry,
                loadModule: makeLoadModule({
                    'm:a': makeImpl('a'),
                    'm:b': makeImpl('b'),
                }),
                registry: reg as never,
                router: makeRouter(),
            }),
        ).rejects.toThrow(/Cycle/)
    })

    it('getDataFactoryArguments мержится в args', async () => {
        const reg = makeRegistry()
        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'm:u', dataFactoryArguments: { limit: 5 } },
        }
        const states = await runGlobalPrefetch({
            route: makeRoute(['userInfo']),
            globalRegistry,
            loadModule: makeLoadModule({
                'm:u': makeImpl('demo', async () => ({ offset: 10 })),
            }),
            registry: reg as never,
            router: makeRouter(),
        })
        const s = states.get('userInfo') as { args: Record<string, unknown> }
        expect(s.args).toEqual({ limit: 5, offset: 10 })
    })

    it('getDataFactoryArguments переопределяет статические args', async () => {
        const reg = makeRegistry()
        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'm:u', dataFactoryArguments: { limit: 5 } },
        }
        const states = await runGlobalPrefetch({
            route: makeRoute(['userInfo']),
            globalRegistry,
            loadModule: makeLoadModule({
                'm:u': makeImpl('demo', async () => ({ limit: 100 })),
            }),
            registry: reg as never,
            router: makeRouter(),
        })
        const s = states.get('userInfo') as { args: Record<string, unknown> }
        expect(s.args.limit).toBe(100)
    })
})

describe('runPagePrefetch', () => {
    it('загружает page-фабрики + глобальные', async () => {
        const reg = makeRegistry()
        const route = makeRoute(['userInfo'])
        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'g:u' },
        }
        const factoryMap: FactoryMap = {
            UserList: { dataFactoryName: 'p:list' },
        }
        const states = await runPagePrefetch(
            {
                route,
                globalRegistry,
                loadModule: makeLoadModule({
                    'g:u': makeImpl('global'),
                    'p:list': makeImpl('page'),
                    'Root:getConfig': () => factoryMap,
                }),
                registry: reg as never,
                router: makeRouter(),
            },
            new Map([['userInfo', { global: true }]]),
        )
        expect([...states.states.keys()].sort()).toEqual(['UserList', 'userInfo'])
        expect([...states.slices.keys()].sort()).toEqual(['UserList', 'userInfo'])
    })

    it('config (dataFactoryArguments) попадает в slices — для гидратации на клиенте', async () => {
        const reg = makeRegistry()
        const route = makeRoute()
        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'g:u', dataFactoryArguments: { locale: 'ru' } },
        }
        const factoryMap: FactoryMap = {
            UserList: { dataFactoryName: 'p:list', dataFactoryArguments: { limit: 10 } },
        }
        const result = await runPagePrefetch(
            {
                route,
                globalRegistry,
                loadModule: makeLoadModule({
                    'g:u': makeImpl('global'),
                    'p:list': makeImpl('page'),
                    'Root:getConfig': () => factoryMap,
                }),
                registry: reg as never,
                router: makeRouter(),
            },
            new Map([['userInfo', { global: true }]]),
        )

        expect(result.slices.get('UserList')?.config).toEqual({ limit: 10 })
        expect(result.slices.get('userInfo')?.config).toEqual({ locale: 'ru' })
    })

    it('A3: коллизии global vs page → ошибка', async () => {
        const reg = makeRegistry()
        const route = makeRoute()
        const globalRegistry: FactoryMap = {
            UserList: { dataFactoryName: 'g:u' },
        }
        const factoryMap: FactoryMap = {
            UserList: { dataFactoryName: 'p:list' },
        }
        await expect(
            runPagePrefetch(
                {
                    route,
                    globalRegistry,
                    loadModule: makeLoadModule({
                        'Root:getConfig': () => factoryMap,
                    }),
                    registry: reg as never,
                    router: makeRouter(),
                },
                new Map(),
            ),
        ).rejects.toThrow(/A3 violation/)
    })

    it('page-фабрика может зависеть от глобальной', async () => {
        const reg = makeRegistry()
        const route = makeRoute(['userInfo'])
        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'g:u' },
        }
        const factoryMap: FactoryMap = {
            UserList: {
                dataFactoryName: 'p:list',
                dependencies: ['userInfo'],
            },
        }
        const result = await runPagePrefetch(
            {
                route,
                globalRegistry,
                loadModule: makeLoadModule({
                    'g:u': makeImpl('global'),
                    'p:list': makeImpl('page'),
                    'Root:getConfig': () => factoryMap,
                }),
                registry: reg as never,
                router: makeRouter(),
            },
            new Map([['userInfo', { global: true }]]),
        )
        const listState = result.states.get('UserList') as {
            depsMap: Record<string, unknown>
        }
        expect(listState.depsMap.userInfo).toEqual({ global: true })
    })

    it('топосорт: зависимость загружается раньше', async () => {
        const reg = makeRegistry()
        const route = makeRoute()
        const factoryMap: FactoryMap = {
            B: { dataFactoryName: 'm:b', dependencies: ['A'] },
            A: { dataFactoryName: 'm:a' },
        }
        const loaded: string[] = []
        const loadModule = async (spec: string) => {
            loaded.push(spec)
            return spec === 'Root:getConfig' ? () => factoryMap : makeImpl(spec)
        }
        await runPagePrefetch(
            {
                route,
                globalRegistry: {},
                loadModule,
                registry: reg as never,
                router: makeRouter(),
            },
            new Map(),
        )
        // A должен быть загружен до B
        expect(loaded.indexOf('m:a')).toBeLessThan(loaded.indexOf('m:b'))
    })

    it('цикл в page-зависимостях → ошибка', async () => {
        const reg = makeRegistry()
        const route = makeRoute()
        const factoryMap: FactoryMap = {
            A: { dataFactoryName: 'm:a', dependencies: ['B'] },
            B: { dataFactoryName: 'm:b', dependencies: ['A'] },
        }
        await expect(
            runPagePrefetch(
                {
                    route,
                    globalRegistry: {},
                    loadModule: makeLoadModule({
                        'm:a': makeImpl('a'),
                        'm:b': makeImpl('b'),
                        'Root:getConfig': () => factoryMap,
                    }),
                    registry: reg as never,
                    router: makeRouter(),
                },
                new Map(),
            ),
        ).rejects.toThrow(/Cycle/)
    })

    it('неизвестная зависимость → ошибка', async () => {
        const reg = makeRegistry()
        const route = makeRoute()
        const factoryMap: FactoryMap = {
            A: { dataFactoryName: 'm:a', dependencies: ['Ghost'] },
        }
        await expect(
            runPagePrefetch(
                {
                    route,
                    globalRegistry: {},
                    loadModule: makeLoadModule({
                        'm:a': makeImpl('a'),
                        'Root:getConfig': () => factoryMap,
                    }),
                    registry: reg as never,
                    router: makeRouter(),
                },
                new Map(),
            ),
        ).rejects.toThrow(/Unknown dependency "Ghost"/)
    })
})

describe('runPrefetch (facade)', () => {
    it('global + page в одном вызове', async () => {
        const reg = makeRegistry()
        const route = makeRoute(['userInfo'])
        const globalRegistry: FactoryMap = {
            userInfo: { dataFactoryName: 'g:u' },
        }
        const factoryMap: FactoryMap = {
            Users: { dataFactoryName: 'p:u' },
        }
        const result = await runPrefetch({
            route,
            globalRegistry,
            loadModule: makeLoadModule({
                'g:u': makeImpl('global'),
                'p:u': makeImpl('page'),
                'Root:getConfig': () => factoryMap,
            }),
            registry: reg as never,
            router: makeRouter(),
        })
        expect([...result.slices.keys()].sort()).toEqual(['Users', 'userInfo'])
        expect(reg.size()).toBe(2)
    })
})

describe('параллельная загрузка фабрик', () => {
    /**
     * Фабрика с управляемой задержкой, фиксирует порядок старта и конца `loadData`.
     *
     * @param name имя в журнале.
     * @param ms задержка `loadData`.
     * @param log журнал событий.
     * @returns impl.
     */
    function timedImpl(name: string, ms: number, log: string[]): FactoryImplementation {
        return {
            loadData: async (_args, depsMap) => {
                log.push(`start:${name}`)
                await new Promise((r) => setTimeout(r, ms))
                log.push(`end:${name}`)
                return { name, deps: Object.keys(depsMap) }
            },
            slice: AnySlice,
        }
    }

    it('page: независимые фабрики стартуют одновременно, а не по очереди', async () => {
        const log: string[] = []
        const factoryMap: FactoryMap = {
            a: { dataFactoryName: 'm:a' },
            b: { dataFactoryName: 'm:b' },
            c: { dataFactoryName: 'm:c' },
        }
        const started = Date.now()
        await runPagePrefetch(
            {
                route: makeRoute(),
                globalRegistry: {},
                loadModule: makeLoadModule({
                    'm:a': timedImpl('a', 60, log),
                    'm:b': timedImpl('b', 60, log),
                    'm:c': timedImpl('c', 60, log),
                    'Root:getConfig': () => factoryMap,
                }),
                registry: makeRegistry() as never,
                router: makeRouter(),
            },
            new Map(),
        )
        // Все три `loadData` начались до завершения первого.
        expect(log.slice(0, 3).sort()).toEqual(['start:a', 'start:b', 'start:c'])
        // ~60 мс, а не ~180 (с запасом на таймеры CI).
        expect(Date.now() - started).toBeLessThan(150)
    })

    it('page: зависимая фабрика ждёт зависимость и получает её данные', async () => {
        const log: string[] = []
        const factoryMap: FactoryMap = {
            a: { dataFactoryName: 'm:a' },
            b: { dataFactoryName: 'm:b', dependencies: ['a'] },
        }
        const result = await runPagePrefetch(
            {
                route: makeRoute(),
                globalRegistry: {},
                loadModule: makeLoadModule({
                    'm:a': timedImpl('a', 30, log),
                    'm:b': timedImpl('b', 1, log),
                    'Root:getConfig': () => factoryMap,
                }),
                registry: makeRegistry() as never,
                router: makeRouter(),
            },
            new Map(),
        )
        expect(log).toEqual(['start:a', 'end:a', 'start:b', 'end:b'])
        expect((result.states.get('b') as { deps: string[] }).deps).toEqual(['a'])
    })

    it('page: порядок slices и registry — топологический, не по скорости завершения', async () => {
        const log: string[] = []
        const reg = makeRegistry()
        const order: string[] = []
        reg.setPage = (k: string) => {
            order.push(k)
            return undefined as never
        }
        const factoryMap: FactoryMap = {
            slow: { dataFactoryName: 'm:slow' },
            fast: { dataFactoryName: 'm:fast' },
        }
        const result = await runPagePrefetch(
            {
                route: makeRoute(),
                globalRegistry: {},
                loadModule: makeLoadModule({
                    'm:slow': timedImpl('slow', 50, log),
                    'm:fast': timedImpl('fast', 1, log),
                    'Root:getConfig': () => factoryMap,
                }),
                registry: reg as never,
                router: makeRouter(),
            },
            new Map(),
        )
        expect(log.indexOf('end:fast')).toBeLessThan(log.indexOf('end:slow'))
        expect([...result.slices.keys()]).toEqual(['slow', 'fast'])
        expect(order).toEqual(['slow', 'fast'])
    })

    it('page: ошибка одной фабрики отклоняет весь prefetch', async () => {
        const factoryMap: FactoryMap = {
            ok: { dataFactoryName: 'm:ok' },
            bad: { dataFactoryName: 'm:bad' },
        }
        await expect(
            runPagePrefetch(
                {
                    route: makeRoute(),
                    globalRegistry: {},
                    loadModule: makeLoadModule({
                        'm:ok': makeImpl('ok'),
                        'm:bad': {
                            loadData: async () => {
                                throw new Error('boom')
                            },
                            slice: AnySlice,
                        },
                        'Root:getConfig': () => factoryMap,
                    }),
                    registry: makeRegistry() as never,
                    router: makeRouter(),
                },
                new Map(),
            ),
        ).rejects.toThrow('boom')
    })

    it('global: независимые загрузчики идут параллельно, зависимый — после', async () => {
        const log: string[] = []
        const globalRegistry: FactoryMap = {
            g1: { dataFactoryName: 'm:g1' },
            g2: { dataFactoryName: 'm:g2' },
            g3: { dataFactoryName: 'm:g3', dependencies: ['g1'] },
        }
        const states = await runGlobalPrefetch(
            {
                route: makeRoute(['g1', 'g2', 'g3']),
                globalRegistry,
                loadModule: makeLoadModule({
                    'm:g1': timedImpl('g1', 40, log),
                    'm:g2': timedImpl('g2', 40, log),
                    'm:g3': timedImpl('g3', 1, log),
                }),
                registry: makeRegistry() as never,
                router: makeRouter(),
            },
            {},
        )
        expect(log.indexOf('start:g2')).toBeLessThan(log.indexOf('end:g1'))
        expect(log.indexOf('start:g3')).toBeGreaterThan(log.indexOf('end:g1'))
        expect((states.get('g3') as { deps: string[] }).deps).toEqual(['g1'])
    })
})
