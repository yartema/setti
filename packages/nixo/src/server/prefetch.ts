/**
 * Server-side prefetch: реэкспорт из `shared/prefetch`.
 */
export {
    runGlobalPrefetch,
    runPagePrefetch,
    runPrefetch,
} from '../shared/prefetch'
export type {
    PrefetchContext,
    PrefetchRegistry,
    PrefetchResult,
    PrefetchSliceInfo,
} from '../shared/prefetch'
