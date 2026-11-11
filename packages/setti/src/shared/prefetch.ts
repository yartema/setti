import { SettiError } from '../errors'
import type { AbstractSlice } from '../client/slices/AbstractSlice'
import type {
    FactoryImplementation,
    FactoryMap,
    SettiRoute,
    SettiRouter,
} from '../types'

/** Минимальный контракт реестра слайсов. */
export interface PrefetchRegistry {
    setPage(key: string, slice: unknown): void
    setGlobal(key: string, slice: unknown): void
    get(key: string): unknown
}

/** Контекст prefetch (изоморфный). */
export interface PrefetchContext {
    route: SettiRoute
    globalRegistry: FactoryMap
    loadModule: (spec: string) => Promise<unknown>
    registry: PrefetchRegistry
    router: SettiRouter
}

/** Информация о слайсе для сериализации. */
export interface PrefetchSliceInfo {
    dataFactoryName: string
    state: unknown
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
    const needed = new Set<string>(
        route.contentConfig.prefetchConfig.dependencies ?? [],
    )

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
            throw new SettiError(
                `Global dependency "${name}" not found in any *.loader.ts`,
            )
        }
        return def.dependencies ?? []
    })

    for (const name of sorted) {
        const def = globalRegistry[name]!
        const implRaw = await loadModule(def.dataFactoryName)
        const impl = implRaw as Partial<FactoryImplementation>
        if (
            !impl ||
            typeof impl.loadData !== 'function' ||
            typeof impl.slice !== 'function'
        ) {
            throw new SettiError(
                `Invalid global loader "${name}": expected loadData + slice class`,
            )
        }

        const args: Record<string, unknown> = { ...(def.dataFactoryArguments ?? {}) }
        if (typeof impl.getDataFactoryArguments === 'function') {
            Object.assign(args, await impl.getDataFactoryArguments())
        }
        const deps: Record<string, unknown> = {}
        for (const dep of def.dependencies ?? []) deps[dep] = states.get(dep)

        const data = await impl.loadData(args, deps, { router })
        states.set(name, data)
        slices.set(name, {
            dataFactoryName: def.dataFactoryName,
            state: data,
            scope: 'global',
        })

        const SliceClass = impl.slice as new () => AbstractSlice<unknown>
        const slice = new SliceClass()
        slice.hydrate(data)
        registry.setGlobal(name, slice)
    }

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
        throw new SettiError(
            `configLoader "${prefetchCfg.configLoader}" must export a function`,
        )
    }
    const factoryMap = (await getConfigRaw(
        prefetchCfg.configParams ?? {},
        router,
    )) as FactoryMap
    if (!factoryMap || typeof factoryMap !== 'object') {
        throw new SettiError(
            `getConfig from "${prefetchCfg.configLoader}" must return an object`,
        )
    }

    for (const name of Object.keys(factoryMap)) {
        if (globalRegistry[name]) {
            throw new SettiError(
                `A3 violation: "${name}" declared both in page's getConfig and global registry`,
            )
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
            throw new SettiError(
                `Unknown dependency "${name}" — not in getConfig, not a loaded global`,
            )
        }
        return def.dependencies ?? []
    })

    for (const name of sorted) {
        const def = factoryMap[name]!
        const implRaw = await loadModule(def.dataFactoryName)
        const impl = implRaw as Partial<FactoryImplementation>
        if (
            !impl ||
            typeof impl.loadData !== 'function' ||
            typeof impl.slice !== 'function'
        ) {
            throw new SettiError(`Invalid factory "${name}": expected loadData + slice`)
        }

        const args: Record<string, unknown> = { ...(def.dataFactoryArguments ?? {}) }
        if (typeof impl.getDataFactoryArguments === 'function') {
            Object.assign(args, await impl.getDataFactoryArguments())
        }
        const deps: Record<string, unknown> = {}
        for (const dep of def.dependencies ?? []) deps[dep] = states.get(dep)

        const data = await impl.loadData(args, deps, { router })
        states.set(name, data)
        slices.set(name, {
            dataFactoryName: def.dataFactoryName,
            state: data,
            scope: 'page',
        })

        const SliceClass = impl.slice as new () => AbstractSlice<unknown>
        const slice = new SliceClass()
        slice.hydrate(data)
        registry.setPage(name, slice)
    }

    // В `slices` (для `__SETTI_STATE__`) добавим и global — чтобы клиент восстановил.
    for (const [name, data] of globalStates) {
        const def = globalRegistry[name]
        if (def) {
            slices.set(name, {
                dataFactoryName: def.dataFactoryName,
                state: data,
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
function topoSort(
    nodes: Set<string>,
    depsOf: (name: string) => string[],
): string[] {
    const result: string[] = []
    const state = new Map<string, 'visiting' | 'done'>()

    const visit = (name: string, pathStack: string[]): void => {
        const s = state.get(name)
        if (s === 'done') return
        if (s === 'visiting') {
            throw new SettiError(
                `Cycle detected: ${[...pathStack, name].join(' → ')}`,
            )
        }
        state.set(name, 'visiting')
        for (const dep of depsOf(name)) visit(dep, [...pathStack, name])
        state.set(name, 'done')
        result.push(name)
    }

    for (const name of nodes) visit(name, [])
    return result
}