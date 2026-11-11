/**
 * Публичный API setti — client-safe.
 *
 * Всё, что экспортируется из этого файла, безопасно грузить в браузер.
 * Не тянет jiti, fastify, vite и другие node-only зависимости.
 *
 * Server-only API — в `setti/server`.
 * React-хуки и провайдер — в `setti/client`.
 */

// Конфиг (pure, без jiti).
export { defineSettiConfig } from './define-config'

// Маршруты и глобальные загрузчики.
export { defineRoute } from './define-route'
export { defineGlobalLoader } from './define-global-loader'

// Классы слайсов (pure TS, без React).
export { AbstractSlice } from './client/slices/AbstractSlice'
export { Slice } from './client/slices/Slice'
export { SliceRegistry } from './client/slices/SliceRegistry'
export type { SliceListener, SliceUpdater } from './client/slices/AbstractSlice'

// URL-билдер.
export { computePath } from './url'

// Ошибки.
export { SettiError } from './errors'

// Типы.
export type {
    SettiConfig,
    ResolvedSettiConfig,
    SettiRoute,
    SettiRouter,
    FactoryDef,
    FactoryMap,
    FactoryImplementation,
    RouteTree,
    Manifest,
    ManifestEntry,
    ModuleKind,
    ScanResult,
    HttpMethod,
    MiddlewareDef,
    ServerRoute,
    ServerPluginDef,
    ServerPluginsOptions,
    SettiClientRouter,
    RpcOptions,
    ResolvedRpcOptions,
    RpcContext,
    RpcObjectDefinition,
    RpcMethodDefinition,
    RpcParamsSchema,
    AuthRequirement,
    RpcExecutor,
    StandardSchemaV1,
    ServiceOptions,
    CrudOp,
    IBinding,
} from './types'
export { SettiRpcError } from './errors'
export type { JsonRpcErrorPayload } from './errors'
export { Service as SettiService } from './client/rpc/Service'

// Prefetch (изоморфный).
export { runGlobalPrefetch, runPagePrefetch, runPrefetch } from './shared/prefetch'
export type { PrefetchContext, PrefetchRegistry, PrefetchResult, PrefetchSliceInfo } from './shared/prefetch'
export { SettiErrorBoundary, SettiLoading, SettiNotFound } from './client/index'
export type { SettiErrorBoundaryProps } from './client/index'
export { devalueParse, devalueStringify } from './client/index'
