import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createSSRHandler } from './ssr-handler'
import { createDevModuleLoader, createProdModuleLoader } from './module-loader'
import { tustenPlugin } from '../vite/plugin'
import { resolveCssMainPath } from '../utils/css'
import { createRpcExecutor } from './rpc-executor'
import { createRpcHandler } from './rpc-handler'
import { getRpcContext } from './rpc/als'
import type { ComponentType, ReactNode } from 'react'
import type { Plugin, UserConfig } from 'vite'
import type { FactoryMap, Manifest, MiddlewareDef, ResolvedTustenConfig, RouteTree, RpcExecutor } from '../types'
import type { RpcRegistry } from './rpc-registry'

/** Режим работы сервера. */
export type TustenServerMode = 'development' | 'production'

/** Опции создания сервера. */
export interface CreateServerOptions {
    config: ResolvedTustenConfig
    projectDir: string
    routeTree: RouteTree
    manifest: Manifest
    globalRegistry: FactoryMap
    factoryModules: string[]
    /** RPC-реестр (null если RPC отключён). */
    rpcRegistry: RpcRegistry | null
    mode?: TustenServerMode
}

/**
 * Создаёт Fastify-сервер.
 *
 * Регистрирует (в порядке):
 *   1. RPC endpoint `POST /service` (если `config.rpc.enabled`).
 *   2. Fastify-плагины (`config.server.plugins`).
 *   3. `/__tusten/prefetch/:routeId` — SPA-navigation (wrapped in ALS).
 *   4. API-роуты (`config.server.routes`).
 *   5. SSR/SPA HTML catch-all.
 *
 * @param options опции.
 * @returns Fastify-инстанс.
 */
export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
    const {
        config,
        projectDir,
        routeTree,
        manifest,
        globalRegistry,
        factoryModules,
        rpcRegistry,
        mode = 'development',
    } = options

    const fastify = Fastify({
        logger: { level: 'info' },
        ...config.fastify,
    })
    const clientDir = path.resolve(projectDir, config.clientDir)
    const outDir = path.resolve(projectDir, config.build.outDir)
    const cssMainPath = resolveCssMainPath(projectDir, clientDir, config)

    let RootProvider: ComponentType<{
        children?: ReactNode
        sliceRegistry: unknown
        router: unknown
    }>
    let SliceRegistry: new () => unknown
    let renderLayoutChain: (page: ReactNode, layouts: ComponentType[]) => ReactNode
    let RootErrorBoundary: ComponentType<{
        children?: ReactNode
        fallback?: ComponentType<{ error: Error }>
    }>
    let RootLoading: ComponentType
    let RootNotFound: ComponentType
    let loadModule: (spec: string) => Promise<unknown>
    let entryScriptSrc: string
    let clientManifest: Record<string, never> | null = null
    const clientOutPublicPrefix = '/'
    const isDev = mode === 'development'

    if (isDev) {
        const { createServer } = await import('vite')
        const react = (await import('@vitejs/plugin-react')).default
        const userVite = (config.vite ?? {}) as UserConfig

        const vite = await createServer({
            ...userVite,
            root: projectDir,
            server: { ...(userVite.server ?? {}), middlewareMode: true },
            appType: 'custom',
            configFile: false,
            ssr: {
                ...(userVite.ssr ?? {}),
                noExternal: ['@tusten/core', ...((userVite.ssr?.noExternal as string[]) ?? [])],
            },
            optimizeDeps: {
                ...(userVite.optimizeDeps ?? {}),
                exclude: ['@tusten/core', ...((userVite.optimizeDeps?.exclude as string[]) ?? [])],
            },
            plugins: [
                tustenPlugin({
                    projectDir,
                    clientDir,
                    config,
                    routeTree,
                    factoryModules,
                    globalFactories: globalRegistry,
                    cssMain: cssMainPath,
                }),
                react(),
                ...((userVite.plugins as Plugin[]) ?? []),
            ],
            resolve: { ...(userVite.resolve ?? {}), preserveSymlinks: false },
        })

        // Skip Vite middleware для API/RPC/prefetch — их обрабатывает Fastify.
        fastify.addHook('onRequest', (req, reply, done) => {
            const url = req.url.split('?')[0]
            const isHtml = req.headers.accept?.includes('text/html')
            const isApi = url.startsWith('/api/') || url.startsWith('/__tusten/') || url === config.rpc.url
            if (isHtml || isApi) {
                done()
                return
            }
            vite.middlewares(req.raw, reply.raw, done)
        })

        // Vite резолвит `tusten/client` через `exports` пакета → dist/client/index.js.
        // `noExternal: ['@tusten/core']` заставляет Vite трансформировать, а не externalize.
        const tustenClient = (await vite.ssrLoadModule('@tusten/core/client')) as {
            RootProvider: typeof RootProvider
            SliceRegistry: typeof SliceRegistry
            renderLayoutChain: typeof renderLayoutChain
            RootErrorBoundary: typeof RootErrorBoundary
            RootLoading: typeof RootLoading
            RootNotFound: typeof RootNotFound
        }

        RootProvider = tustenClient.RootProvider
        SliceRegistry = tustenClient.SliceRegistry
        renderLayoutChain = tustenClient.renderLayoutChain
        RootErrorBoundary = tustenClient.RootErrorBoundary
        RootLoading = tustenClient.RootLoading
        RootNotFound = tustenClient.RootNotFound
        loadModule = createDevModuleLoader(clientDir, vite)
        entryScriptSrc = '/@id/__x00__virtual:tusten/client-entry'
    } else {
        const serverEntry = path.join(outDir, 'server', 'entry.js')
        const clientOut = path.join(outDir, 'client')

        const manifestPath = path.join(clientOut, '.vite', 'manifest.json')
        try {
            const raw = await fs.readFile(manifestPath, 'utf8')
            clientManifest = JSON.parse(raw) as Record<string, never>
        } catch (err) {
            fastify.log.warn(
                `[tusten] client manifest not found at ${manifestPath}: ${(err as Error).message}. ` +
                    `CSS for production will not be injected.`,
            )
        }

        const entryMod = (await import(pathToFileURL(serverEntry).href)) as {
            RootProvider: typeof RootProvider
            SliceRegistry: typeof SliceRegistry
            renderLayoutChain: typeof renderLayoutChain
            RootErrorBoundary: typeof RootErrorBoundary
            RootLoading: typeof RootLoading
            RootNotFound: typeof RootNotFound
        }

        RootProvider = entryMod.RootProvider
        SliceRegistry = entryMod.SliceRegistry
        renderLayoutChain = entryMod.renderLayoutChain
        RootErrorBoundary = entryMod.RootErrorBoundary
        RootLoading = entryMod.RootLoading
        RootNotFound = entryMod.RootNotFound
        loadModule = createProdModuleLoader(serverEntry)
        entryScriptSrc = '/client.js'

        await fastify.register(fastifyStatic, {
            root: clientOut,
            prefix: '/',
            wildcard: false,
        })
    }

    // ---- RPC executor + /service endpoint ----
    let rpcExecutor: RpcExecutor | undefined
    if (config.rpc.enabled && rpcRegistry) {
        rpcExecutor = createRpcExecutor(rpcRegistry, config)

        // Прокидываем ALS-геттер в globalThis — server-bridge использует его
        // в client-коде, но не тянет node:async_hooks в браузер.
        ;(globalThis as unknown as { __rootRpcGetContext?: () => unknown }).__rootRpcGetContext = getRpcContext

        const rpcHandler = createRpcHandler({ registry: rpcRegistry, config })
        fastify.post(config.rpc.url, rpcHandler)
    }

    // ---- Server plugins ----
    if (config.server.plugins) {
        const { loadServerPlugins } = await import('./server-plugins-loader')
        const { registerServerPlugins } = await import('./api-register')
        const plugins = await loadServerPlugins(projectDir, config.server.plugins)
        await registerServerPlugins(fastify, plugins)
    }

    // ---- API routes ----
    if (config.server.routes) {
        const { loadServerRoutes } = await import('./server-routes-loader')
        const { registerServerRoutes } = await import('./api-register')
        const routes = await loadServerRoutes(projectDir, config.server.routes)
        await registerServerRoutes(fastify, routes, projectDir)
    }

    // ---- SSR handler ----
    const globalMiddleware: MiddlewareDef[] = (config.middleware ?? []).filter(
        (m) => m.side === 'server' || m.side === 'both',
    )

    const ssrHandler = createSSRHandler({
        config,
        projectDir,
        clientDir,
        routeTree,
        manifest,
        mode,
        globalRegistry,
        RootProvider,
        SliceRegistry,
        loadModule,
        isDev,
        entryScriptSrc,
        clientManifest,
        clientOutPublicPrefix,
        globalMiddleware,
        rpcExecutor,
        renderLayoutChain,
        RootErrorBoundary,
        RootLoading,
        RootNotFound,
    })

    fastify.get('/*', ssrHandler)

    return fastify
}
