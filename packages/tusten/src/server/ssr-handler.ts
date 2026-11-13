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
import { resolveRequestLocale } from './i18n/negotiate'
import { runWithI18nContext, type I18nRequestContext } from './i18n/als'
import { buildI18nBootScript } from './i18n/boot'
import type { I18nDictionary } from '../client/i18n/create-rk'
import { matchRoute } from '../url'
import type {
    FactoryMap,
    Manifest,
    MiddlewareDef,
    TustenClientRouter,
    TustenRouter,
    ResolvedTustenConfig,
    RouteTree,
    RpcExecutor,
} from '../types'
import { resolveMeta } from '../shared/meta-resolver'
import type { PageMeta } from '../types'

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

/**
 * i18n-рантайм `tusten/client` для SSR. Берётся из того же инстанса модуля, что
 * и `RootProvider`: иначе `rk` в рендере и резолвер locale окажутся в разных копиях.
 */
export interface SSRI18nRuntime {
    /** Загружает словари всех известных `createRk`-модулей для locale. */
    loadDictionaries(locale: string): Promise<void>
    /** Словарь модуля для locale, если уже загружен. */
    getDictionary(moduleId: string, locale: string): I18nDictionary | undefined
}

/** Опции SSR-обработчика. */
export interface SSRHandlerOptions {
    config: ResolvedTustenConfig
    projectDir: string
    clientDir: string
    routeTree: RouteTree
    manifest: Manifest
    mode: 'development' | 'production'
    globalRegistry: FactoryMap
    RootProvider: ComponentType<{
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
    /** i18n-рантайм; `null` — i18n выключен в конфиге, тогда ни locale, ни словари не трогаем. */
    i18n?: SSRI18nRuntime | null
    /** Оборачивает страницу цепочкой layouts (root → leaf). */
    renderLayoutChain: (page: ReactNode, layouts: ComponentType[]) => ReactNode
    /** Error Boundary фреймворка. */
    RootErrorBoundary: ComponentType<{
        children?: ReactNode
        fallback?: ComponentType<{ error: Error }>
    }>
    /** Дефолтный loading (если `config.client.components.loading` не задан). */
    RootLoading: ComponentType
    /** Дефолтный 404 (если `config.client.components.notFound` не задан). */
    RootNotFound: ComponentType
}

/** Дефолтная meta — используется как fallback для `<title>` и при ошибках. */
const DEFAULT_PAGE_META: PageMeta = { title: 'Страница', meta: [], microdata: {} }

/**
 * Создаёт обработчик SSR-запросов.
 *
 * Режимы:
 *   - SSR: React-рендер, `hydrateRoot` на клиенте.
 *   - SPA (`config.ssr === false` / `route.ssr === false` / `?noSSR=true`):
 *     пустой каркас, `createRoot` на клиенте.
 *
 * `__ROOT_STATE_STR__` — JSON-строка от `devalue.stringify`.
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
        globalRegistry,
        RootProvider,
        SliceRegistry,
        loadModule,
        isDev,
        entryScriptSrc,
        clientManifest,
        clientOutPublicPrefix = '/',
        globalMiddleware,
        rpcExecutor,
        i18n: i18nRuntime = null,
        renderLayoutChain,
        RootErrorBoundary,
        RootNotFound,
    } = options

    // Всё ниже зависит только от конфига и режима, а не от запроса,
    // поэтому считаем один раз при создании обработчика.
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
    const middlewareJson = JSON.stringify(clientMiddleware).replace(/</g, '\\u003c')
    const middlewareScript = `<script>window.__ROOT_MIDDLEWARE__=${middlewareJson}</script>`

    const debugState = Boolean(process.env.TUSTEN_DEBUG)

    /**
     * Хвост документа: закрывающий `</div>`, флаг режима, состояние и entry.
     *
     * @param ssr рендерился ли HTML на сервере.
     * @param stateJson `__ROOT_STATE_STR__` (пустая строка в SPA и на 404).
     * @param i18nBoot `<script>` с `window.__ROOT_I18N__` (пустая строка, если i18n выключен).
     * @returns HTML-строка.
     */
    const documentTail = (ssr: boolean, stateJson: string, i18nBoot = ''): string =>
        `</div>` +
        `<script>window.__ROOT_SSR__=${ssr}</script>` +
        middlewareScript +
        i18nBoot +
        `<script>window.__ROOT_STATE_STR__=${JSON.stringify(stateJson || '')}</script>` +
        `${entryScript}</body></html>`

    /**
     * Значение `Vary` для i18n-ответов: один URL отдаёт разную locale в зависимости
     * от cookie и `Accept-Language`, без `Vary` кэш вернёт чужой язык.
     */
    const I18N_VARY = 'Accept-Language, Cookie'
    const i18nHeaders = i18nRuntime ? { Vary: I18N_VARY } : undefined
    /**
     * `Vary` для HTML с учётом i18n.
     *
     * @param base уже существующее значение (например `Accept`).
     * @returns итоговое значение заголовка.
     */
    const varyFor = (base: string): string => (i18nRuntime ? `${base}, ${I18N_VARY}` : base)

    /**
     * Кэш загруженных SSR-модулей.
     *
     * Только prod: в dev `vite.ssrLoadModule` сам инвалидирует граф при HMR,
     * собственный кэш вернул бы устаревший компонент.
     */
    const moduleCache = new Map<string, Promise<unknown>>()

    /**
     * Загружает модуль по спеке, кэшируя результат в prod.
     *
     * @param spec спека (`<file>` или `<file>:<export>`).
     * @returns значение экспорта.
     */
    const loadModuleCached = (spec: string): Promise<unknown> => {
        if (isDev) return loadModule(spec)

        const cached = moduleCache.get(spec)
        if (cached) return cached

        const pending = loadModule(spec)
        // Ошибку не кэшируем: следующий запрос может прийти уже после фикса.
        void pending.catch(() => moduleCache.delete(spec))
        moduleCache.set(spec, pending)
        return pending
    }

    return async function handler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
        reply.hijack()

        /**
         * Ответ уже начат или завершён.
         *
         * После `hijack()` Fastify не вмешивается: незакрытый или дважды
         * закрытый `reply.raw` — это «висящий» либо упавший запрос.
         */
        let ended = false

        /**
         * Отдаёт готовый ответ и помечает его завершённым.
         *
         * @param status HTTP-статус.
         * @param contentType значение `Content-Type`.
         * @param body тело ответа.
         * @param headers дополнительные заголовки.
         */
        const send = (status: number, contentType: string, body: string, headers?: Record<string, string>): void => {
            if (ended) return
            ended = true

            if (reply.raw.headersSent) {
                reply.raw.destroy()
                return
            }

            reply.raw.statusCode = status
            reply.raw.setHeader('Content-Type', contentType)
            // HTML/JSON содержат per-request состояние — кэшировать нельзя.
            reply.raw.setHeader('Cache-Control', 'no-store')
            if (headers) {
                for (const [name, value] of Object.entries(headers)) reply.raw.setHeader(name, value)
            }
            reply.raw.end(body)
        }

        /**
         * Отдаёт пустой 302.
         *
         * @param location адрес редиректа.
         */
        const redirect = (location: string): void => {
            if (ended) return
            ended = true

            if (reply.raw.headersSent) {
                reply.raw.destroy()
                return
            }

            reply.raw.statusCode = 302
            reply.raw.setHeader('Location', location)
            reply.raw.setHeader('Cache-Control', 'no-store')
            reply.raw.end()
        }

        /**
         * Аварийный ответ.
         *
         * Текст ошибки отдаётся только в dev: в prod он раскрывает пути и стек.
         *
         * @param label метка для лога.
         * @param err ошибка.
         */
        const fail = (label: string, err: unknown): void => {
            console.error(`[tusten] ${label}:`, err)

            if (ended || reply.raw.headersSent) {
                ended = true
                if (!reply.raw.writableEnded) reply.raw.destroy()
                return
            }

            const detail = isDev
                ? escapeHtml(err instanceof Error ? err.message : String(err))
                : 'Internal Server Error'
            send(500, 'text/html; charset=utf-8', `<!DOCTYPE html><html><body><pre>${detail}</pre></body></html>`)
        }

        // Locale определяем один раз на запрос: cookie и заголовки не меняются
        // посреди рендера, а весь HTML (SSR, 404, SPA) должен быть на одном языке.
        const i18nLocale =
            i18nRuntime && config.i18n
                ? resolveRequestLocale(
                      { cookie: req.headers.cookie, acceptLanguage: req.headers['accept-language'] },
                      config.i18n,
                  )
                : undefined
        const i18nCtx: I18nRequestContext | undefined =
            i18nLocale !== undefined ? { locale: i18nLocale, used: new Set<string>() } : undefined

        /**
         * Boot-скрипт `window.__ROOT_I18N__`: locale страницы и встроенные словари.
         *
         * @param dicts словари модулей, которые нужны гидрации этой страницы.
         * @returns HTML-строка или пустая, если i18n выключен.
         */
        const bootScript = (dicts: Record<string, I18nDictionary> = {}): string =>
            i18nLocale !== undefined ? buildI18nBootScript(i18nLocale, dicts) : ''

        /**
         * Словари модулей, у которых `rk` был вызван во время рендера этого запроса.
         *
         * Вызывать только после рендера: до него набор неполный. Модули, не
         * использованные на сервере, не встраиваем — их словари подтянет клиент.
         *
         * @returns `moduleId → словарь` для locale запроса.
         */
        const collectUsedDictionaries = (): Record<string, I18nDictionary> => {
            const out: Record<string, I18nDictionary> = {}
            if (!i18nRuntime || i18nLocale === undefined || !i18nCtx) return out
            for (const moduleId of i18nCtx.used) {
                const dict = i18nRuntime.getDictionary(moduleId, i18nLocale)
                if (dict) out[moduleId] = dict
            }
            return out
        }

        const runHandler = async (): Promise<void> => {
            const url = req.url.split('?')[0]
            const query = queryToObject(req.url)
            const matched = matchRoute(url, routeTree.compiled)
            const route = matched ? (routeTree.byId.get(matched.routeId) ?? null) : null
            const params = matched?.params ?? {}

            // ---- 404 ----
            if (!route) {
                const accept = req.headers.accept ?? ''
                const wantsJson = accept.includes('application/json') && !accept.includes('text/html')

                if (wantsJson) {
                    // `Vary` обязателен: по одному URL два разных представления.
                    send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not Found', path: url }), {
                        Vary: 'Accept',
                    })
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

                // Та же структура, что на клиенте (`RootProvider` + `<NotFound/>`
                // с `routeId: '__not-found__'`), иначе `hydrateRoot` даст mismatch.
                const nfRegistry = new SliceRegistry()
                const nfRouter: TustenClientRouter = {
                    path: url,
                    params: {},
                    query,
                    routeId: '__not-found__',
                }

                /**
                 * Рендерит 404 в структуру, которую гидрирует клиент.
                 *
                 * @param node содержимое страницы.
                 * @returns HTML-строка.
                 */
                const renderNotFound = (node: ReactNode): string =>
                    renderToString(
                        createElement(RootProvider, { sliceRegistry: nfRegistry as unknown, router: nfRouter }, node),
                    )

                let notFoundHtml: string
                try {
                    const NotFound = config.client.components.notFound
                        ? ((await loadModuleCached(config.client.components.notFound)) as ComponentType)
                        : RootNotFound
                    // Словари нужны до рендера: `rk` синхронный и без словаря отдаст ключи.
                    if (i18nRuntime && i18nLocale !== undefined) await i18nRuntime.loadDictionaries(i18nLocale)
                    notFoundHtml = renderNotFound(createElement(NotFound))
                } catch (err) {
                    console.warn(
                        '[tusten] failed to render config.client.components.notFound, fallback to default:',
                        err,
                    )
                    notFoundHtml = renderNotFound(createElement(RootNotFound))
                }

                const notFoundMeta: PageMeta = { title: '404', meta: [], microdata: {} }

                send(
                    404,
                    'text/html; charset=utf-8',
                    buildHead(notFoundMeta, { cssLinksHtml: notFoundCss, viteClientScript }) +
                        notFoundHtml +
                        documentTail(true, '', bootScript(collectUsedDictionaries())),
                    { Vary: varyFor('Accept') },
                )
                return
            }

            // ---- Режим (per-route + глобальный + ?noSSR) ----
            const globalSSR = config.ssr !== false
            const routeSSR = globalSSR ? route.ssr !== false : false
            const shouldSSR = routeSSR && query.noSSR !== 'true'

            const cssCtx: BuildCssLinksContext = {
                isDev,
                clientManifest,
                clientOutPublicPrefix,
                mode: shouldSSR ? 'ssr' : 'spa',
                projectDir,
                clientDir,
                route,
                config,
                layoutTypes: routeTree.layoutChains.get(route.id),
            }
            const cssLinksHtml = buildCssLinks(cssCtx)

            // ---- SPA ----
            if (!shouldSSR) {
                // В SPA-режиме `readMethod`/`getMetaCallback` не вызываем:
                // клиент подхватит meta через `usePageMeta`, если нужно.
                const spaMeta: PageMeta = {
                    title: route.metaConfig?.title ?? DEFAULT_PAGE_META.title,
                    meta: route.metaConfig?.meta ?? [],
                    microdata: route.metaConfig?.microdata ?? {},
                }

                // Словарей нет: клиент догрузит их перед рендером, а locale сообщаем уже здесь.
                send(
                    200,
                    'text/html; charset=utf-8',
                    buildHead(spaMeta, { cssLinksHtml, viteClientScript }) + documentTail(false, '', bootScript()),
                    i18nHeaders,
                )
                return
            }

            // ---- SSR ----
            let Template: ComponentType
            const Layouts: ComponentType[] = []

            try {
                const templateSpec = route.contentConfig.workspaceConfig.template
                const layoutTypes = routeTree.layoutChains.get(route.id) ?? []
                const layoutSpecs = layoutTypes
                    .map((type) => config.client.layouts[type])
                    .filter((rel): rel is string => Boolean(rel))
                    .map((rel) => rel.replace(/^\.\//, ''))

                // Шаблон и layouts независимы: в dev (без кэша модулей) грузим
                // параллельно, порядок `Layouts` сохраняется (root → leaf).
                const [templateValue, ...layoutValues] = await Promise.all([
                    loadModuleCached(templateSpec),
                    ...layoutSpecs.map((spec) => loadModuleCached(spec)),
                ])
                if (typeof templateValue !== 'function') {
                    throw new Error(`Template is not a component: ${templateSpec}`)
                }
                Template = templateValue as ComponentType

                for (const layoutValue of layoutValues) {
                    if (typeof layoutValue === 'function') {
                        Layouts.push(layoutValue as ComponentType)
                    }
                }

                // Импорт шаблона и layouts создаёт `createRk`-инстансы; только после этого
                // known-список модулей полон и можно загрузить их словари до рендера.
                if (i18nRuntime && i18nLocale !== undefined) await i18nRuntime.loadDictionaries(i18nLocale)
            } catch (err) {
                fail('SSR error', err)
                return
            }

            const sliceRegistry = new SliceRegistry()

            const router: TustenRouter = {
                id: route.id,
                path: url,
                params,
                query,
                request: req,
            }

            // Meta объявляется до `try`, чтобы `prefix` мог использовать её
            // даже при ошибке в prefetch (fallback — заголовок «Страница»).
            let pageMeta: PageMeta = { ...DEFAULT_PAGE_META, title: route.metaConfig?.title ?? DEFAULT_PAGE_META.title }
            let serializedStateJson = ''
            // Vite-пути модулей слайсов: клиент грузит их перед гидратацией
            // (`loadSliceClass`), серверу они известны заранее — для preload.
            let sliceModulePaths: string[] = []

            // Кастомный Error-компонент не зависит от данных: грузим параллельно
            // с prefetch, а не после него. Ошибку глотаем сразу — fallback на
            // дефолтный boundary, как и раньше.
            const errorComponentSpec = config.client.components.error
            const errorComponentPromise: Promise<ComponentType<{ error: Error }> | undefined> = errorComponentSpec
                ? loadModuleCached(errorComponentSpec).then(
                      (mod) => mod as ComponentType<{ error: Error }>,
                      (err) => {
                          console.warn(
                              '[tusten] failed to load config.client.components.error, fallback to default:',
                              err,
                          )
                          return undefined
                      },
                  )
                : Promise.resolve(undefined)

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
                    redirect(mwResult.redirect)
                    return
                }

                // Абсолютный URL для `readMethod` / `getMetaCallback`.
                const origin = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol
                const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.hostname
                const fullUrl = `${origin}://${host}${req.url}`

                const [prefetchResult, computedMeta] = await Promise.all([
                    runPagePrefetch(
                        {
                            route,
                            globalRegistry,
                            loadModule,
                            registry: sliceRegistry as never,
                            router,
                        },
                        globalStates,
                    ),
                    resolveMeta(route, router, fullUrl, loadModule),
                ])

                // Присваиваем внешней переменной (не const, чтобы не затенить).
                pageMeta = computedMeta

                const serialized = await serializeState(prefetchResult.slices, projectDir, clientDir)
                serializedStateJson = stringifyState(serialized)
                sliceModulePaths = Object.values(serialized.slices).map((s) => s.modulePath)
            } catch (err) {
                fail('Prefetch error', err)
                return
            }

            if (debugState) {
                console.log(`[tusten] __ROOT_STATE_STR__ length=${serializedStateJson.length}`)
            }

            // Error Boundary с fallback из `config.client.components.error`.
            const ErrorComponent = await errorComponentPromise

            const child = createElement(Template)
            const tree = createElement(
                RootErrorBoundary,
                { fallback: ErrorComponent },
                renderLayoutChain(child, Layouts),
            )

            // Preload entry и чанков маршрута в `<head>`: загрузка идёт параллельно
            // с HTML, а не после выполнения `client.js` (водопад перед гидратацией).
            // CSS стоит ПЕРВЫМ: он render-blocking, и на узком канале preload JS,
            // запрошенный раньше стилей, оттягивает на себя полосу и задерживает FCP/LCP.
            const prefix = buildHead(pageMeta, {
                cssLinksHtml: cssLinksHtml + buildModulePreloads(cssCtx, entryScriptSrc, sliceModulePaths),
                viteClientScript,
            })

            const initialRouter = {
                path: url,
                params,
                query,
                routeId: route.id,
            }

            let didError = false
            let shellSent = false

            const stream = renderToPipeableStream(
                createElement(RootProvider, { sliceRegistry: sliceRegistry as unknown, router: initialRouter }, tree),
                {
                    onShellReady() {
                        if (shellSent) return
                        shellSent = true

                        // Клиент уже отключился — продолжать рендер незачем.
                        if (ended || reply.raw.destroyed) {
                            ended = true
                            stream.abort()
                            return
                        }

                        ended = true
                        reply.raw.statusCode = didError ? 500 : 200
                        reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
                        reply.raw.setHeader('Cache-Control', 'no-store')
                        if (i18nHeaders) reply.raw.setHeader('Vary', I18N_VARY)
                        const inject = new Transform({
                            transform(chunk, _enc, cb) {
                                cb(null, chunk)
                            },
                            // Суффикс собираем здесь, а не до рендера: к концу стрима
                            // `i18nCtx.used` содержит все модули, которые реально вызвали `rk`.
                            flush(cb) {
                                this.push(
                                    documentTail(true, serializedStateJson, bootScript(collectUsedDictionaries())),
                                )
                                cb()
                            },
                        })
                        reply.raw.write(prefix)
                        stream.pipe(inject).pipe(reply.raw)
                    },
                    onShellError(err) {
                        didError = true
                        fail('Shell error', err)
                    },
                    onError(err) {
                        didError = true
                        console.error('[tusten] SSR error:', err)
                    },
                },
            )
        }

        const runRequest = async (): Promise<void> => {
            // ALS-контекст (executor для SSR `Service.call`).
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
                        cache: new Map(), // per-request кэш Service
                    },
                    runHandler,
                )
            } else {
                await runHandler()
            }
        }

        try {
            // i18n-ALS поверх RPC-ALS: locale и учёт `rk` видны всему рендеру этого запроса.
            await (i18nCtx ? runWithI18nContext(i18nCtx, runRequest) : runRequest())
        } catch (err) {
            // Всё, что вылетело до `reply.raw.end()` (парсинг URL, 404-рендер,
            // middleware), иначе оставило бы запрос висеть до таймаута.
            fail('Handler error', err)
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
    route: import('../types').TustenRoute | null
    config: ResolvedTustenConfig
    /** Цепочка layout-типов маршрута (root → leaf); без неё — только `route.type`. */
    layoutTypes?: string[]
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
        for (const cssRel of ctx.config.client.css) {
            hrefs.push(resolveVitePath(ctx.projectDir, path.resolve(ctx.clientDir, cssRel)))
        }
        if (ctx.route) {
            const directFiles: string[] = []
            const templateRel = ctx.route.contentConfig.workspaceConfig.template.split(':')[0]
            directFiles.push(path.resolve(ctx.clientDir, templateRel))
            const layoutTypes = ctx.layoutTypes ?? (ctx.route.type ? [ctx.route.type] : [])
            for (const t of layoutTypes) {
                const layoutRel = ctx.config.client.layouts[t]
                if (layoutRel) {
                    directFiles.push(path.resolve(ctx.clientDir, layoutRel.replace(/^\.\//, '')))
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

    // CSS общих чанков лежит не в `entry.css` самого шаблона/layout, а в
    // чанках из `imports`: без обхода они не попадают в `<head>` (FOUC).
    const seen = new Set<string>()
    const addWithImports = (entry: ViteClientManifestEntry | undefined): void => {
        if (!entry || seen.has(entry.file)) return
        seen.add(entry.file)
        add(entry.css)
        for (const key of entry.imports ?? []) addWithImports(mf[key])
    }

    for (const entry of Object.values(mf)) {
        if (entry.isEntry) add(entry.css)
    }

    if (ctx.mode === 'spa') {
        for (const entry of Object.values(mf)) add(entry.css)
    } else if (ctx.route) {
        for (const entry of findRouteManifestEntries(ctx, mf)) addWithImports(entry)
    }

    return hrefs.map((href) => `<link rel="stylesheet" href="${href}">`).join('')
}

/**
 * Находит записи manifest для шаблона и всей цепочки layout маршрута.
 *
 * @param ctx контекст сборки.
 * @param mf Vite manifest клиента.
 * @returns записи manifest (шаблон, затем layouts).
 */
function findRouteManifestEntries(
    ctx: BuildCssLinksContext,
    mf: Record<string, ViteClientManifestEntry>,
): ViteClientManifestEntry[] {
    if (!ctx.route) return []

    const files = [ctx.route.contentConfig.workspaceConfig.template.split(':')[0]]
    // Вся цепочка layout (root → leaf), а не только `route.type`: CSS
    // родительских layout иначе пропадает из `<head>`.
    const layoutTypes = ctx.layoutTypes ?? (ctx.route.type ? [ctx.route.type] : [])
    for (const type of layoutTypes) {
        const layoutRel = ctx.config.client.layouts[type]
        if (layoutRel) files.push(layoutRel.replace(/^\.\//, ''))
    }

    const found: ViteClientManifestEntry[] = []
    for (const rel of files) {
        found.push(...findManifestEntriesBySpec(ctx, mf, rel))
    }
    return found
}

/**
 * Ищет записи manifest по пути модуля (без расширения).
 *
 * `src` в Vite manifest — путь от root БЕЗ ведущего `/`, тогда как
 * `resolveVitePath` отдаёт `/client/...`: прямое `startsWith` не совпадало
 * никогда, и CSS шаблона/layout в prod не попадал в `<head>` (FOUC).
 * Сравниваем по границе расширения, чтобы `View` не цеплял `ViewFoo.tsx`.
 *
 * @param ctx контекст сборки.
 * @param mf Vite manifest клиента.
 * @param rel путь модуля от `clientDir` (с расширением или без).
 * @returns подходящие записи manifest.
 */
function findManifestEntriesBySpec(
    ctx: BuildCssLinksContext,
    mf: Record<string, ViteClientManifestEntry>,
    rel: string,
): ViteClientManifestEntry[] {
    const base = resolveVitePath(ctx.projectDir, path.resolve(ctx.clientDir, rel)).replace(/^\//, '')
    return Object.values(mf).filter(
        (entry) => entry.src !== undefined && (entry.src === base || entry.src.startsWith(base + '.')),
    )
}

/**
 * Собирает `<link rel="modulepreload">` для SSR-страницы (только prod).
 *
 * Браузер находит `client.js` лишь в самом конце документа, а чанки
 * шаблона/layout — только после выполнения `client.js` (водопад перед
 * гидратацией). Preload в `<head>` запускает их загрузку параллельно с HTML.
 *
 * @param ctx контекст сборки.
 * @param entryScriptSrc URL entry-скрипта.
 * @param sliceModulePaths Vite-пути модулей слайсов страницы (`/client/...`).
 * @returns HTML-строка (пустая в dev и без manifest).
 */
function buildModulePreloads(
    ctx: BuildCssLinksContext,
    entryScriptSrc: string,
    sliceModulePaths: string[] = [],
): string {
    if (ctx.isDev || !ctx.clientManifest) return ''

    const mf = ctx.clientManifest
    const hrefs: string[] = [entryScriptSrc]
    const seen = new Set<string>()

    const visit = (entry: ViteClientManifestEntry | undefined): void => {
        if (!entry || seen.has(entry.file) || entry.isEntry) return
        seen.add(entry.file)
        const href = ctx.clientOutPublicPrefix + entry.file
        if (!hrefs.includes(href)) hrefs.push(href)
        for (const key of entry.imports ?? []) visit(mf[key])
    }

    // Статические зависимости самого entry (runtime-чанк): без них `client.js`
    // упирается в ещё один запрос.
    for (const entry of Object.values(mf)) {
        if (entry.isEntry) for (const key of entry.imports ?? []) visit(mf[key])
    }
    for (const entry of findRouteManifestEntries(ctx, mf)) visit(entry)

    // Классы слайсов из `__ROOT_STATE_STR__`: иначе они качаются уже после
    // выполнения `client.js` — ещё один RTT перед `hydrateRoot`.
    for (const modulePath of sliceModulePaths) {
        const src = modulePath.replace(/^\//, '')
        for (const entry of Object.values(mf)) {
            if (entry.src === src) visit(entry)
        }
    }

    // Кастомный Error-компонент грузится до гидратации (client-entry).
    const errorSpec = ctx.config.client.components.error
    if (errorSpec) {
        for (const entry of findManifestEntriesBySpec(ctx, mf, errorSpec.split(':')[0])) visit(entry)
    }

    return hrefs.map((href) => `<link rel="modulepreload" href="${href}">`).join('')
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
 * @param sourceFiles абсолютные пути (без расширения или с).
 * @param projectDir корень проекта.
 * @returns Vite-пути до CSS.
 */
function collectDirectCssImports(sourceFiles: string[], projectDir: string): string[] {
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
 * `URLSearchParams` (в отличие от ручного `decodeURIComponent`) не бросает
 * `URIError` на битом percent-encoding и понимает `+` как пробел.
 *
 * @param url полный URL.
 * @returns объект query (при повторе ключа побеждает последнее значение).
 */
function queryToObject(url: string): Record<string, string> {
    const idx = url.indexOf('?')
    if (idx === -1) return {}
    const result: Record<string, string> = {}
    for (const [key, value] of new URLSearchParams(url.slice(idx + 1))) {
        result[key] = value
    }
    return result
}

/**
 * Собирает `<head>` с title, meta-тегами, JSON-LD, CSS и Vite-клиентом.
 *
 * Возвращает открытый `<div id="root">` в конце, чтобы вызывающий код
 * мог стримить контент и закрыть `</div>` суффиксом.
 *
 * @param meta готовая meta страницы (title, meta[], microdata).
 * @param opts опции.
 * @param opts.cssLinksHtml готовая строка `<link rel="stylesheet">` для `<head>`.
 * @param opts.viteClientScript `<script type="module">` Vite-клиента (только dev).
 * @returns HTML: `<!DOCTYPE html>…</head><body><div id="root">`.
 */
function buildHead(meta: PageMeta, opts: { cssLinksHtml: string; viteClientScript: string }): string {
    const tags = meta.meta
        .map((m) => `<meta ${m.attribute ?? 'name'}="${escapeHtml(m.name)}" content="${escapeHtml(m.content)}">`)
        .join('')

    const micro =
        Object.keys(meta.microdata).length > 0
            ? `<script type="application/ld+json">${JSON.stringify(meta.microdata).replace(/</g, '\\u003c')}</script>`
            : ''

    return (
        `<!DOCTYPE html><html><head><meta charset="utf-8">` +
        `<title>${escapeHtml(meta.title)}</title>` +
        tags +
        micro +
        opts.cssLinksHtml +
        opts.viteClientScript +
        `</head><body><div id="root">`
    )
}

/**
 * Экранирует HTML-спецсимволы.
 *
 * @param s строка.
 * @returns экранированная.
 */
function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
