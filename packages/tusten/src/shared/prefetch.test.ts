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
        title: 'Home',
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
