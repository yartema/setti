import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToPipeableStream, renderToString } from 'react-dom/server'
import { Transform } from 'node:stream'
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { runGlobalPrefetch, runPagePrefetch } from './prefetch'
import { serializeState, stringifyState } from './serialize'
import { runServerMiddleware } from './run-server-middleware'
import { runWithRpcContext, parseCookieHeader } from './rpc/als'
import { matchRoute } from '../url'
import type {
    FactoryMap,
    Manifest,
    MiddlewareDef,
    SettiRouter,
    ResolvedSettiConfig,
    RouteTree,
    RpcExecutor,
} from '../types'

/** Запись Vite client manifest (подмножество). */
interface ViteClientManifestEntry {
    file: string
    src?: string
    isEntry?: boolean
    isDynamicEntry?: boolean
    imports?: string[]
    css?: string[]
    dynamicImports?: string[]
}

/** Опции SSR-обработчика. */
export interface SSRHandlerOptions {
    config: ResolvedSettiConfig
    projectDir: string
    clientDir: string
    routeTree: RouteTree
    manifest: Manifest
    mode: 'development' | 'production'
    globalRegistry: FactoryMap
    SettiProvider: ComponentType<{
        children?: ReactNode
        sliceRegistry: unknown
        router: unknown
    }>
    SliceRegistry: new () => unknown
    loadModule: (spec: string) => Promise<unknown>
    isDev: boolean
    entryScriptSrc: string
    clientManifest?: Record<string, ViteClientManifestEntry> | null
    clientOutPublicPrefix?: string
    globalMiddleware: MiddlewareDef[]
    /** JSON-RPC executor для SSR. */
    rpcExecutor?: RpcExecutor
    /** Оборачивает страницу цепочкой layouts (root → leaf). */
    renderLayoutChain: (page: ReactNode, layouts: ComponentType[]) => ReactNode
    /** Error Boundary фреймворка. */
    SettiErrorBoundary: ComponentType<{
        children?: ReactNode
        fallback?: ComponentType<{ error: Error }>
    }>
    /** Дефолтный loading (если `config.components.loading` не задан). */
    SettiLoading: ComponentType
    /** Дефолтный 404 (если `config.components.notFound` не задан). */
    SettiNotFound: ComponentType
}

/**
 * Создаёт обработчик SSR-запросов.
 *
 * Режимы:
 *   - SSR: React-рендер, `hydrateRoot` на клиенте.
 *   - SPA (`config.ssr === false` / `route.ssr === false` / `?noSSR=true`):
 *     пустой каркас, `createRoot` на клиенте.
 *
 * `__SETTI_STATE_STR__` — JSON-строка от `devalue.stringify` (поддерживает
 * `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, `Infinity`, cyclic).
 * На клиенте парсится через `devalue.parse`.
 *
 * @param options опции.
 * @returns async-обработчик.
 */
export function createSSRHandler(options: SSRHandlerOptions) {
    const {
        config,
        projectDir,
        clientDir,
        routeTree,
        manifest: _manifest,
        mode: _mode,
        globalRegistry,
        SettiProvider,
        SliceRegistry,
        loadModule,
        isDev,
        entryScriptSrc,
        clientManifest,
        clientOutPublicPrefix = '/',
        globalMiddleware,
        rpcExecutor,
        renderLayoutChain,
        SettiErrorBoundary,
        SettiLoading: _SettiLoading,
        SettiNotFound,
    } = options

    return async function handler(
        req: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        reply.hijack()

        const runHandler = async (): Promise<void> => {
            const url = req.url.split('?')[0]
            const query = queryToObject(req.url)
            const matched = matchRoute(url, routeTree.compiled)
            const route = matched
                ? (routeTree.byId.get(matched.routeId) ?? null)
                : null
            const params = matched?.params ?? {}

            const viteClientScript = isDev
                ? `<script type="module" src="/@vite/client"></script>
<script type="module">
  import RefreshRuntime from "/@react-refresh"
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true
</script>`
                : ''

            const entryScript = `<script type="module" src="${entryScriptSrc}"></script>`

            const clientMiddleware = (config.middleware ?? []).filter(
                (m) => !m.side || m.side === 'client' || m.side === 'both',
            )
            const middlewareJson = JSON.stringify(clientMiddleware).replace(
                /</g,
                '\\u003c',
            )
            const middlewareScript = `<script>window.__SETTI_MIDDLEWARE__=${middlewareJson}</script>`

            // ---- 404 ----
            if (!route) {
                const accept = req.headers.accept ?? ''
                const wantsJson =
                    accept.includes('application/json') && !accept.includes('text/html')

                if (wantsJson) {
                    reply.raw.statusCode = 404
                    reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8')
                    reply.raw.end(JSON.stringify({ error: 'Not Found', path: url }))
                    return
                }

                const notFoundCss = buildCssLinks({
                    isDev,
                    clientManifest,
                    clientOutPublicPrefix,
                    mode: 'spa',
                    projectDir,
                    clientDir,
                    route: null,
                    config,
                })

                // Рендер `<NotFound/>` через `renderToString` — та же структура,
                // что на клиенте (`SettiProvider` + `<NotFound/>`), чтобы
                // `hydrateRoot` не дал mismatch.
                const nfRegistry = new SliceRegistry()
                const nfRouter = {
                    id: '__not-found__',
                    path: url,
                    params: {},
                    query,
                    request: req,
                }

                let notFoundHtml: string
                if (config.components.notFound) {
                    try {
                        const NotFound = (await loadModule(
                            config.components.notFound,
                        )) as ComponentType
                        notFoundHtml = renderToString(
                            createElement(
                                SettiProvider,
                                { sliceRegistry: nfRegistry as unknown, router: nfRouter },
                                createElement(NotFound),
                            ),
                        )
                    } catch (err) {
                        console.warn(
                            '[setti] failed to render config.components.notFound, fallback to default:',
                            err,
                        )
                        notFoundHtml = renderToString(
                            createElement(
                                SettiProvider,
                                { sliceRegistry: nfRegistry as unknown, router: nfRouter },
                                createElement(SettiNotFound),
                            ),
                        )
                    }
                } else {
                    notFoundHtml = renderToString(
                        createElement(
                            SettiProvider,
                            { sliceRegistry: nfRegistry as unknown, router: nfRouter },
                            createElement(SettiNotFound),
                        ),
                    )
                }

                reply.raw.statusCode = 404
                reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
                reply.raw.end(
                    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>404</title>${notFoundCss}${viteClientScript}</head>` +
                    `<body><div id="root">${notFoundHtml}</div>` +
                    `<script>window.__SETTI_SSR__=true</script>` +
                    middlewareScript +
                    `<script>window.__SETTI_STATE_STR__=""</script>` +
                    `${entryScript}</body></html>`,
                )
                return
            }

            // ---- Режим (per-route + глобальный + ?noSSR) ----
            const globalSSR = config.ssr !== false
            const routeSSR = globalSSR ? route.ssr !== false : false
            const shouldSSR = routeSSR && query.noSSR !== 'true'

            const ssrFlagScript = `<script>window.__SETTI_SSR__=${shouldSSR}</script>`

            const cssLinksHtml = buildCssLinks({
                isDev,
                clientManifest,
                clientOutPublicPrefix,
                mode: shouldSSR ? 'ssr' : 'spa',
                projectDir,
                clientDir,
                route,
                config,
            })

            // ---- SPA ----
            if (!shouldSSR) {
                reply.raw.statusCode = 200
                reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
                reply.raw.end(
                    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
                    `<title>${escapeHtml(route.title)}</title>${cssLinksHtml}${viteClientScript}</head>` +
                    `<body><div id="root"></div>` +
                    ssrFlagScript +
                    middlewareScript +
                    `<script>window.__SETTI_STATE_STR__=""</script>` +
                    `${entryScript}</body></html>`,
                )
                return
            }

            // ---- SSR ----
            let Template: ComponentType
            const Layouts: ComponentType[] = []

            try {
                const templateSpec = route.contentConfig.workspaceConfig.template
                const templateValue = await loadModule(templateSpec)
                if (typeof templateValue !== 'function') {
                    throw new Error(`Template is not a component: ${templateSpec}`)
                }
                Template = templateValue as ComponentType

                const layoutTypes = routeTree.layoutChains.get(route.id) ?? []
                for (const type of layoutTypes) {
                    const layoutRel = config.layouts[type]
                    if (!layoutRel) continue
                    const layoutValue = await loadModule(layoutRel.replace(/^\.\//, ''))
                    if (typeof layoutValue === 'function') {
                        Layouts.push(layoutValue as ComponentType)
                    }
                }
            } catch (err) {
                reply.raw.statusCode = 500
                reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
                reply.raw.end(
                    `<!DOCTYPE html><html><body><pre>SSR error: ${escapeHtml(
                        (err as Error).message,
                    )}</pre></body></html>`,
                )
                return
            }

            const sliceRegistry = new SliceRegistry()

            const router: SettiRouter = {
                id: route.id,
                path: url,
                params,
                query,
                request: req,
            }

            let serializedStateJson = ''
            try {
                const globalStates = await runGlobalPrefetch({
                    route,
                    globalRegistry,
                    loadModule,
                    registry: sliceRegistry as never,
                    router,
                })

                const mwResult = await runServerMiddleware(
                    globalMiddleware,
                    route,
                    { router, route, globalSlices: sliceRegistry as never },
                    projectDir,
                )
                if (mwResult && 'redirect' in mwResult) {
                    reply.raw.statusCode = 302
                    reply.raw.setHeader('Location', mwResult.redirect)
                    reply.raw.end()
                    return
                }

                const prefetchResult = await runPagePrefetch(
                    {
                        route,
                        globalRegistry,
                        loadModule,
                        registry: sliceRegistry as never,
                        router,
                    },
                    globalStates,
                )

                const serialized = await serializeState(
                    prefetchResult.slices,
                    projectDir,
                    clientDir,
                )
                serializedStateJson = stringifyState(serialized)
            } catch (err) {
                reply.raw.statusCode = 500
                reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
                reply.raw.end(
                    `<!DOCTYPE html><html><body><pre>Prefetch error: ${escapeHtml(
                        (err as Error).message,
                    )}</pre></body></html>`,
                )
                return
            }

            if (process.env.SETTI_DEBUG) {
                console.log(
                    `[setti] __SETTI_STATE_STR__ length=${serializedStateJson.length}`,
                )
            }

            // Error Boundary с fallback из `config.components.error`.
            let ErrorComponent: ComponentType<{ error: Error }> | undefined
            if (config.components.error) {
                try {
                    ErrorComponent = (await loadModule(
                        config.components.error,
                    )) as ComponentType<{ error: Error }>
                } catch (err) {
                    console.warn(
                        '[setti] failed to load config.components.error, fallback to default:',
                        err,
                    )
                }
            }

            const child = createElement(Template)
            const tree = createElement(
                SettiErrorBoundary,
                { fallback: ErrorComponent },
                renderLayoutChain(child, Layouts),
            )

            const prefix =
                `<!DOCTYPE html><html><head><meta charset="utf-8">` +
                `<title>${escapeHtml(route.title)}</title>${cssLinksHtml}${viteClientScript}</head>` +
                `<body><div id="root">`

            const suffix =
                `</div>` +
                ssrFlagScript +
                middlewareScript +
                `<script>window.__SETTI_STATE_STR__=${JSON.stringify(serializedStateJson || '')}</script>` +
                `${entryScript}</body></html>`

            const initialRouter = {
                path: url,
                params,
                query,
                routeId: route.id,
            }

            let didError = false
            let shellSent = false

            const stream = renderToPipeableStream(
                createElement(
                    SettiProvider,
                    { sliceRegistry: sliceRegistry as unknown, router: initialRouter },
                    tree,
                ),
                {
                    onShellReady() {
                        if (shellSent) return
                        shellSent = true
                        reply.raw.statusCode = didError ? 500 : 200
                        reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
                        const inject = new Transform({
                            transform(chunk, _enc, cb) {
                                cb(null, chunk)
                            },
                            flush(cb) {
                                this.push(suffix)
                                cb()
                            },
                        })
                        reply.raw.write(prefix)
                        stream.pipe(inject).pipe(reply.raw)
                    },
                    onShellError(err) {
                        didError = true
                        if (reply.raw.headersSent) {
                            reply.raw.end()
                            return
                        }
                        reply.raw.statusCode = 500
                        reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
                        reply.raw.end(
                            `<!DOCTYPE html><html><body><pre>Shell error: ${escapeHtml(
                                (err as Error).message,
                            )}</pre></body></html>`,
                        )
                    },
                    onError(err) {
                        didError = true
                        console.error('[setti] SSR error:', err)
                    },
                },
            )
        }

        // ALS-контекст (executor для SSR `SettiService.call`).
        if (rpcExecutor) {
            const headers: Record<string, string> = {}
            for (const [k, v] of Object.entries(req.headers)) {
                if (typeof v === 'string') headers[k] = v
                else if (Array.isArray(v)) headers[k] = v.join(', ')
            }
            const cookies = parseCookieHeader(headers.cookie)
            await runWithRpcContext(
                {
                    headers,
                    cookies,
                    executor: rpcExecutor,
                    cache: new Map(), // per-request кэш SettiService
                },
                runHandler,
            )
        } else {
            await runHandler()
        }
    }
}

/** Контекст сборки CSS-ссылок. */
interface BuildCssLinksContext {
    isDev: boolean
    clientManifest?: Record<string, ViteClientManifestEntry> | null
    clientOutPublicPrefix: string
    mode: 'ssr' | 'spa'
    projectDir: string
    clientDir: string
    route: import('../types').SettiRoute | null
    config: ResolvedSettiConfig
}

/**
 * Собирает `<link rel="stylesheet">` для `<head>`.
 *
 * @param ctx контекст.
 * @returns HTML-строка.
 */
function buildCssLinks(ctx: BuildCssLinksContext): string {
    if (ctx.isDev) {
        const hrefs: string[] = []
        if (ctx.config.css.main) {
            hrefs.push(
                resolveVitePath(
                    ctx.projectDir,
                    path.resolve(ctx.clientDir, ctx.config.css.main),
                ),
            )
        }
        if (ctx.route) {
            const directFiles: string[] = []
            const templateRel = ctx.route.contentConfig.workspaceConfig.template.split(':')[0]
            directFiles.push(path.resolve(ctx.clientDir, templateRel))
            const layoutTypes = ctx.config.layouts
                ? ctx.route.type
                    ? [ctx.route.type]
                    : []
                : []
            for (const t of layoutTypes) {
                const layoutRel = ctx.config.layouts[t]
                if (layoutRel) {
                    directFiles.push(
                        path.resolve(ctx.clientDir, layoutRel.replace(/^\.\//, '')),
                    )
                }
            }
            for (const cssPath of collectDirectCssImports(directFiles, ctx.projectDir)) {
                hrefs.push(cssPath)
            }
        }
        return hrefs.map((h) => `<link rel="stylesheet" href="${h}">`).join('')
    }

    if (!ctx.clientManifest) return ''

    const mf = ctx.clientManifest
    const hrefs: string[] = []
    const add = (files: string[] | undefined) => {
        if (!files) return
        for (const f of files) {
            const href = ctx.clientOutPublicPrefix + f
            if (!hrefs.includes(href)) hrefs.push(href)
        }
    }

    for (const entry of Object.values(mf)) {
        if (entry.isEntry) add(entry.css)
    }

    if (ctx.mode === 'spa') {
        for (const entry of Object.values(mf)) add(entry.css)
    } else if (ctx.route) {
        const templateRel =
            ctx.route.contentConfig.workspaceConfig.template.split(':')[0]
        const templateAbs = path.resolve(ctx.clientDir, templateRel)
        const templateVitePath = resolveVitePath(ctx.projectDir, templateAbs)
        for (const entry of Object.values(mf)) {
            if (entry.src && entry.src.startsWith(templateVitePath)) add(entry.css)
        }

        const layoutRel = ctx.config.layouts[ctx.route.type]
        if (layoutRel) {
            const layoutAbs = path.resolve(
                ctx.clientDir,
                layoutRel.replace(/^\.\//, ''),
            )
            const layoutVitePath = resolveVitePath(ctx.projectDir, layoutAbs)
            for (const entry of Object.values(mf)) {
                if (entry.src && entry.src.startsWith(layoutVitePath)) add(entry.css)
            }
        }
    }

    return hrefs.map((href) => `<link rel="stylesheet" href="${href}">`).join('')
}

/**
 * Абсолютный путь → Vite-путь.
 *
 * @param projectDir корень.
 * @param absPath абсолютный.
 * @returns Vite-путь.
 */
function resolveVitePath(projectDir: string, absPath: string): string {
    return '/' + path.relative(projectDir, absPath).replace(/\\/g, '/')
}

/**
 * Рекурсивно собирает `import '*.css'` из указанных файлов и их
 * JS/TS-импортов (только dev).
 *
 * Используется только в dev: prod-сборка отдаёт CSS через Vite manifest.
 *
 * @param sourceFiles абсолютные пути (без расширения или с).
 * @param projectDir корень проекта.
 * @returns Vite-пути до CSS.
 */
function collectDirectCssImports(
    sourceFiles: string[],
    projectDir: string,
): string[] {
    const result = new Set<string>()
    const visited = new Set<string>()
    const MAX_DEPTH = 30

    /**
     * @param base абсолютный путь (без расширения).
     * @param depth глубина.
     */
    const visit = (base: string, depth: number): void => {
        if (depth > MAX_DEPTH) return

        let file = base
        for (const ext of ['.tsx', '.ts', '.jsx', '.js', '']) {
            if (fs.existsSync(base + ext)) {
                file = base + ext
                break
            }
        }
        if (visited.has(file)) return
        visited.add(file)

        let src: string
        try {
            src = fs.readFileSync(file, 'utf8')
        } catch {
            return
        }

        // 1. CSS-импорты.
        const cssRegex = /import\s+['"](\.{1,2}\/[^'"]+\.css)['"]/g
        let m: RegExpExecArray | null
        while ((m = cssRegex.exec(src)) !== null) {
            const absCss = path.resolve(path.dirname(file), m[1])
            result.add(resolveVitePath(projectDir, absCss))
        }

        // 2. JS/TS-импорты (для рекурсии).
        const jsRegex = /import\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g
        while ((m = jsRegex.exec(src)) !== null) {
            const rel = m[1]
            if (rel.endsWith('.css')) continue
            const childBase = path.resolve(path.dirname(file), rel)
            visit(childBase, depth + 1)
        }
    }

    for (const base of sourceFiles) {
        visit(base, 0)
    }
    return [...result]
}

/**
 * Парсит query-строку.
 *
 * @param url полный URL.
 * @returns объект query.
 */
function queryToObject(url: string): Record<string, string> {
    const idx = url.indexOf('?')
    if (idx === -1) return {}
    const qs = url.slice(idx + 1)
    const result: Record<string, string> = {}
    for (const pair of qs.split('&')) {
        if (!pair) continue
        const [k, v = ''] = pair.split('=')
        result[decodeURIComponent(k)] = decodeURIComponent(v)
    }
    return result
}

/**
 * Экранирует HTML-спецсимволы.
 *
 * @param s строка.
 * @returns экранированная.
 */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}