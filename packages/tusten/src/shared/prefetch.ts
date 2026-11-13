import { TustenError } from '../errors'
import type { AbstractSlice } from '../client/slices/AbstractSlice'
import type { FactoryImplementation, FactoryMap, TustenRoute, TustenRouter } from '../types'

/** Минимальный контракт реестра слайсов. */
export interface PrefetchRegistry {
    setPage(key: string, slice: unknown): void
    setGlobal(key: string, slice: unknown): void
    get(key: string): unknown
}

/** Контекст prefetch (изоморфный). */
export interface PrefetchContext {
    route: TustenRoute
    globalRegistry: FactoryMap
    loadModule: (spec: string) => Promise<unknown>
    registry: PrefetchRegistry
    router: TustenRouter
}

/** Информация о слайсе для сериализации. */
export interface PrefetchSliceInfo {
    dataFactoryName: string
    state: unknown
    /**
     * `dataFactoryArguments` фабрики (аргументы `getConfig`).
     *
     * Уходит в `__ROOT_STATE_STR__`, чтобы `_initState(result, config)` получил
     * одно и то же на сервере и при клиентской гидратации.
     */
    config?: Record<string, unknown>
    scope: 'page' | 'global'
}

/** Результат prefetch. */
export interface PrefetchResult {
    states: Map<string, unknown>
    slices: Map<string, PrefetchSliceInfo>
}

/**
 * Загружает глобальные зависимости (`prefetchConfig.dependencies`).
 *
 * @param ctx контекст.
 * @param opts опции.
 * @param opts.skipExisting пропустить уже загруженные в реестре.
 * @returns `Map<name, state>`.
 */
export async function runGlobalPrefetch(
    ctx: PrefetchContext,
    opts: { skipExisting?: boolean } = {},
): Promise<Map<string, unknown>> {
    const { route, globalRegistry, loadModule, registry, router } = ctx
    const states = new Map<string, unknown>()
    const slices = new Map<string, PrefetchSliceInfo>()
    const needed = new Set<string>(route.contentConfig.prefetchConfig.dependencies ?? [])

    // Транзитивные.
    const queue = [...needed]
    while (queue.length > 0) {
        const name = queue.shift()!
        const def = globalRegistry[name]
        if (!def) continue
        for (const dep of def.dependencies ?? []) {
            if (!needed.has(dep)) {
                needed.add(dep)
                queue.push(dep)
            }
        }
    }

    // skipExisting: фильтруем уже загруженные.
    if (opts.skipExisting) {
        for (const name of [...needed]) {
            if (registry.get(name)) needed.delete(name)
        }
    }

    if (needed.size === 0) return states

    const sorted = topoSort(needed, (name) => {
        const def = globalRegistry[name]
        if (!def) {
            throw new TustenError(`Global dependency "${name}" not found in any *.loader.ts`)
        }
        return def.dependencies ?? []
    })

    // Как и в `runPagePrefetch`: независимые глобальные загрузчики идут
    // параллельно, каждый ждёт только свои `dependencies`.
    const loaded = new Map<string, Promise<Partial<FactoryImplementation>>>()

    /**
     * Загружает глобальный загрузчик после его зависимостей (мемоизировано).
     *
     * @param name имя загрузчика.
     * @returns реализация фабрики.
     * @throws {TustenError} если загрузчик невалиден или не найден.
     */
    const load = (name: string): Promise<Partial<FactoryImplementation>> => {
        const cached = loaded.get(name)
        if (cached) return cached

        const def = globalRegistry[name]
        if (!def) {
            return Promise.reject(new TustenError(`Global dependency "${name}" not found in any *.loader.ts`))
        }

        const depNames = def.dependencies ?? []
        const pending = (async () => {
            const [implRaw] = await Promise.all([loadModule(def.dataFactoryName), ...depNames.map(load)])
            const impl = implRaw as Partial<FactoryImplementation>
            if (!impl || typeof impl.loadData !== 'function' || typeof impl.slice !== 'function') {
                throw new TustenError(`Invalid global loader "${name}": expected loadData + slice class`)
            }

            const args: Record<string, unknown> = { ...(def.dataFactoryArguments ?? {}) }
            if (typeof impl.getDataFactoryArguments === 'function') {
                Object.assign(args, await impl.getDataFactoryArguments())
            }
            const deps: Record<string, unknown> = {}
            for (const dep of depNames) deps[dep] = states.get(dep)

            states.set(name, await impl.loadData(args, deps, { router }))
            return impl
        })()
        loaded.set(name, pending)
        return pending
    }

    const impls = await Promise.all(sorted.map(load))

    // Коммит в топологическом порядке: порядок `slices`/`registry` детерминирован.
    sorted.forEach((name, i) => {
        const def = globalRegistry[name]!
        const impl = impls[i]
        const data = states.get(name)

        // `_initState(result, config)` должен видеть те же аргументы, что
        // `loadData`: конфиг едет в `__ROOT_STATE_STR__` и на клиент.
        const config = def.dataFactoryArguments ?? {}
        slices.set(name, {
            dataFactoryName: def.dataFactoryName,
            state: data,
            config,
            scope: 'global',
        })

        const SliceClass = impl.slice as new () => AbstractSlice<unknown>
        const slice = new SliceClass()
        slice.hydrate(data, config)
        registry.setGlobal(name, slice)
    })

    return states
}

/**
 * Загружает page-scoped фабрики (`getConfig`).
 *
 * @param ctx контекст.
 * @param globalStates результат `runGlobalPrefetch`.
 * @returns полный `PrefetchResult`.
 */
export async function runPagePrefetch(
    ctx: PrefetchContext,
    globalStates: Map<string, unknown>,
): Promise<PrefetchResult> {
    const { route, globalRegistry, loadModule, registry, router } = ctx
    const prefetchCfg = route.contentConfig.prefetchConfig
    const states = new Map<string, unknown>(globalStates)
    const slices = new Map<string, PrefetchSliceInfo>()

    const getConfigRaw = await loadModule(prefetchCfg.configLoader)
    if (typeof getConfigRaw !== 'function') {
        throw new TustenError(`configLoader "${prefetchCfg.configLoader}" must export a function`)
    }
    const factoryMap = (await getConfigRaw(prefetchCfg.configParams ?? {}, router)) as FactoryMap
    if (!factoryMap || typeof factoryMap !== 'object') {
        throw new TustenError(`getConfig from "${prefetchCfg.configLoader}" must return an object`)
    }

    for (const name of Object.keys(factoryMap)) {
        if (globalRegistry[name]) {
            throw new TustenError(`A3 violation: "${name}" declared both in page's getConfig and global registry`)
        }
    }

    const needed = new Set<string>(Object.keys(factoryMap))
    const queue = [...needed]
    while (queue.length > 0) {
        const name = queue.shift()!
        const def = factoryMap[name]
        if (!def) continue
        for (const dep of def.dependencies ?? []) {
            if (!needed.has(dep) && !globalStates.has(dep)) {
                needed.add(dep)
                queue.push(dep)
            }
        }
    }

    const sorted = topoSort(needed, (name) => {
        const def = factoryMap[name]
        if (!def) {
            if (globalStates.has(name)) return []
            throw new TustenError(`Unknown dependency "${name}" — not in getConfig, not a loaded global`)
        }
        return def.dependencies ?? []
    })

    // Независимые фабрики стартуют одновременно: каждая ждёт только свои
    // `dependencies`, а не всех предшественников в топопорядке. Иначе latency
    // `loadData` суммируется (SSR TTFB и SPA-переход), а не берётся по максимуму.
    // `sorted` оставляем ради детекта циклов и детерминированного коммита ниже.
    const loaded = new Map<string, Promise<Partial<FactoryImplementation> | null>>()

    /**
     * Загружает фабрику после её зависимостей (мемоизировано по имени).
     *
     * @param name имя фабрики.
     * @returns реализация фабрики или `null` для глобальной зависимости.
     * @throws {TustenError} если фабрика невалидна.
     */
    const load = (name: string): Promise<Partial<FactoryImplementation> | null> => {
        const cached = loaded.get(name)
        if (cached) return cached

        const def = factoryMap[name]
        // Глобальные зависимости (`userInfo`, ...) уже загружены: `topoSort`
        // обходит всю цепочку `dependencies`, включая узлы из `globalStates`,
        // а их состояние лежит в `states` (через `new Map(globalStates)` выше).
        // Повторно `loadData` не вызываем — только page-фабрики.
        if (!def) return Promise.resolve(null)

        const depNames = def.dependencies ?? []
        const pending = (async () => {
            // Модуль фабрики грузим параллельно с ожиданием зависимостей.
            const [implRaw] = await Promise.all([loadModule(def.dataFactoryName), ...depNames.map(load)])
            const impl = implRaw as Partial<FactoryImplementation>
            if (!impl || typeof impl.loadData !== 'function' || typeof impl.slice !== 'function') {
                throw new TustenError(`Invalid factory "${name}": expected loadData + slice`)
            }

            const args: Record<string, unknown> = { ...(def.dataFactoryArguments ?? {}) }
            if (typeof impl.getDataFactoryArguments === 'function') {
                Object.assign(args, await impl.getDataFactoryArguments())
            }
            const deps: Record<string, unknown> = {}
            for (const dep of depNames) deps[dep] = states.get(dep)

            states.set(name, await impl.loadData(args, deps, { router }))
            return impl
        })()
        loaded.set(name, pending)
        return pending
    }

    const impls = await Promise.all(sorted.map(load))

    // Коммит строго в топологическом порядке: порядок `slices` (а значит и
    // `__ROOT_STATE_STR__`) и `registry` не зависит от гонки завершения.
    sorted.forEach((name, i) => {
        const def = factoryMap[name]
        const impl = impls[i]
        if (!def || !impl) return

        const data = states.get(name)
        const config = def.dataFactoryArguments ?? {}
        slices.set(name, {
            dataFactoryName: def.dataFactoryName,
            state: data,
            config,
            scope: 'page',
        })

        const SliceClass = impl.slice as new () => AbstractSlice<unknown>
        const slice = new SliceClass()
        slice.hydrate(data, config)
        registry.setPage(name, slice)
    })

    // В `slices` (для `__ROOT_STATE_STR__`) добавим и global — чтобы клиент восстановил.
    for (const [name, data] of globalStates) {
        const def = globalRegistry[name]
        if (def) {
            slices.set(name, {
                dataFactoryName: def.dataFactoryName,
                state: data,
                config: def.dataFactoryArguments ?? {},
                scope: 'global',
            })
        }
    }

    return { states, slices }
}

/**
 * Загружает глобальные зависимости (`prefetchConfig.dependencies`).
 *
 * @param ctx контекст.
 * @returns `Map<name, state>`.
 */
export async function runPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
    const globalStates = await runGlobalPrefetch(ctx)
    return runPagePrefetch(ctx, globalStates)
}

/**
 * Топосортировка с обнаружением циклов.
 *
 * @param nodes множество имён.
 * @param depsOf функция зависимостей.
 * @returns отсортированный массив.
 */
function topoSort(nodes: Set<string>, depsOf: (name: string) => string[]): string[] {
    const result: string[] = []
    const state = new Map<string, 'visiting' | 'done'>()

    const visit = (name: string, pathStack: string[]): void => {
        const s = state.get(name)
        if (s === 'done') return
        if (s === 'visiting') {
            throw new TustenError(`Cycle detected: ${[...pathStack, name].join(' → ')}`)
        }
        state.set(name, 'visiting')
        for (const dep of depsOf(name)) visit(dep, [...pathStack, name])
        state.set(name, 'done')
        result.push(name)
    }

    for (const name of nodes) visit(name, [])
    return result
}
