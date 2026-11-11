/**
 * Server-only API setti.
 *
 * Всё, что экспортируется из этого файла, требует Node.js и тянет
 * jiti/fastify/vite. Не импортировать в браузер.
 */

// Конфиг.
export { loadConfig } from './config'

// Резолвер, сканер, дерево, манифест.
export { resolveModule } from './resolver'
export { scan } from './scanner'
export { buildRouteTree } from './route-tree'
export { buildManifest } from './manifest'

// Сервер.
export { createSettiServer } from './server/create-server'
export type { CreateServerOptions, SettiServerMode } from './server/create-server'

export { createDevModuleLoader, createProdModuleLoader } from './server/module-loader'

export { runPrefetch } from './shared/prefetch'
export type { PrefetchContext, PrefetchResult, PrefetchSliceInfo } from './shared/prefetch'

export { serializeState, stringifyState } from './server/serialize'
export type { SerializedState } from './server/serialize'

// Vite-плагин.
export { settiPlugin } from './vite/plugin'
export type { SettiVitePluginOptions } from './vite/plugin'

// Build.
export { buildProject } from './build/build'
export type { BuildProjectOptions } from './build/build'
export { buildClient } from './build/build-client'
export type { BuildClientOptions } from './build/build-client'
export { buildServer } from './build/build-server'
export type { BuildServerOptions } from './build/build-server'
export { collectFactoryModules } from './build/collect-factories'

export { defineServerRoutes } from './define-server-routes'
export { defineServerPlugins } from './define-server-plugins'
export { loadServerRoutes } from './server/server-routes-loader'
export { loadServerPlugins } from './server/server-plugins-loader'
export { registerServerPlugins, registerServerRoutes } from './server/api-register'
export type {
    ApiRouteContext,
    ApiMiddlewareContext,
    ApiRouteHandler,
    ApiMiddlewareHandler,
} from './server/api-register'
export { loadMiddleware } from './server/middleware-loader'
export { runServerMiddleware } from './server/run-server-middleware'
export type { ServerMiddlewareContext, ServerMiddlewareResult } from './server/run-server-middleware'
export { runGlobalPrefetch, runPagePrefetch } from './server/prefetch'
export type { MiddlewareSide, MiddlewareFn } from './server/middleware-loader'
export { defineObject } from './define-object'
export { scanRpcObjects } from './server/rpc-scanner'
export { RpcRegistry } from './server/rpc-registry'
export type { RpcRegisteredMethod } from './server/rpc-registry'
// RPC — типы, которые прикладник использует в *.meta.ts.
export type {
    RpcContext,
    RpcObjectDefinition,
    RpcMethodDefinition,
    RpcParamsSchema,
    AuthRequirement,
    RpcOptions,
    ResolvedRpcOptions,
    RpcExecutor,
    StandardSchemaV1,
    StandardSchemaV1Issue,
    StandardSchemaV1Result,
    StandardSchemaV1Success,
    StandardSchemaV1Failure,
} from './types'
export { createRpcHandler } from './server/rpc-handler'
export type { RpcHandlerOptions } from './server/rpc-handler'
export { createRpcExecutor } from './server/rpc-executor'
export { runWithRpcContext, getRpcContext, parseCookieHeader } from './server/rpc/als'
export type { RpcAlsContext } from './server/rpc/als'
