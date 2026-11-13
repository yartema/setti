import path from 'node:path'
import fs from 'node:fs'
import type { Plugin, ViteDevServer } from 'vite'
import type { CompiledRoute, FactoryMap, MiddlewareDef, TustenRoute, ResolvedTustenConfig, RouteTree } from '../types'
import { toVitePath } from '../utils/fs'
import { scanI18n } from '../scanner'
import {
    I18N_DICT_PREFIX,
    I18N_USER_PREFIX,
    I18N_VIRTUAL_PREFIX,
    generateI18nDictModule,
    generateI18nModule,
    parseDictionary,
} from './i18n'

/** Опции Vite-плагина tusten. */
export interface TustenVitePluginOptions {
    projectDir: string
    clientDir: string
    config: ResolvedTustenConfig
    routeTree: RouteTree
    /** Спеки factory-модулей (`dataFactoryName`). */
    factoryModules?: string[]
    /** Глобальный реестр фабрик (`*.loader.ts`). */
    globalFactories?: FactoryMap
    /** Vite-пути до глобальных CSS (`config.css`). */
    cssFiles?: string[]
}

const VIRTUAL_ROUTES = 'virtual:tusten/routes'
const RESOLVED_ROUTES = '\0' + VIRTUAL_ROUTES
const VIRTUAL_ENTRY = 'virtual:tusten/client-entry'
const RESOLVED_ENTRY = '\0' + VIRTUAL_ENTRY
const VIRTUAL_SSR_ENTRY = 'virtual:tusten/ssr-entry'
const RESOLVED_SSR_ENTRY = '\0' + VIRTUAL_SSR_ENTRY

/**
 * Vite-плагин tusten.
 *
 * @param options опции.
 * @returns Vite-плагин.
 */
export function tustenPlugin(options: TustenVitePluginOptions): Plugin {
    const { projectDir, clientDir, config, routeTree, factoryModules = [], globalFactories = {}, cssFiles = [] } = options

    /**
     * Резолвит спеку клиентского модуля в Vite-путь.
     *
     * @param spec спека.
     * @returns Vite-путь.
     */
    function resolveSpec(spec: string): string {
        const [rawFile] = spec.split(':')
        const file = rawFile.replace(/^\.\//, '')
        const abs = path.resolve(clientDir, file)
        let finalAbs = abs
        for (const ext of ['.tsx', '.ts', '.jsx', '.js', '']) {
            if (fs.existsSync(abs + ext)) {
                finalAbs = abs + ext
                break
            }
        }
        return toVitePath(projectDir, finalAbs)
    }

    /**
     * Резолвит путь middleware в Vite-путь.
     *
     * @param handler спека.
     * @returns Vite-путь.
     */
    function resolveMiddlewarePath(handler: string): string {
        const [rawFile] = handler.split(':')
        const file = rawFile.replace(/^\.\//, '')
        const abs = path.resolve(projectDir, file)
        let finalAbs = abs
        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
            if (fs.existsSync(abs + ext)) {
                finalAbs = abs + ext
                break
            }
        }
        return toVitePath(projectDir, finalAbs)
    }

    /**
     * Определяет, серверный ли middleware.
     *
     * @param def middleware.
     * @returns `true` если не должен попадать в client bundle.
     */
    function isServerOnly(def: MiddlewareDef): boolean {
        if (def.side === 'server') return true
        if (def.side === 'client' || def.side === 'both') return false
        return def.handler.startsWith('server/')
    }

    // ---- 1. Данные маршрутов ----
    const routesData = Array.from(routeTree.byId.entries()).map(([id, route]) => {
        const urlPath = routeTree.paths.get(id)!
        const templatePath = resolveSpec(route.contentConfig.workspaceConfig.template)
        const templateExport = route.contentConfig.workspaceConfig.template.split(':')[1] ?? 'default'

        return {
            id,
            path: urlPath,
            title: route.metaConfig?.title ?? 'Страница',
            description: route.metaConfig?.meta?.find((m) => m.name === 'description')?.content ?? null,
            templatePath,
            templateExport,
            middleware: route.middleware ?? [],
            meta: route.meta ?? {},
            metaConfig: route.metaConfig ?? null,
            contentConfig: route.contentConfig,
            layoutChain: routeTree.layoutChains.get(id) ?? [],
        }
    })

    // ---- 2. layoutPaths: type → { path, export } ----
    const layoutPaths: Record<string, { path: string; export: string }> = {}
    for (const [type, rel] of Object.entries(config.client.layouts)) {
        layoutPaths[type] = {
            path: resolveSpec(rel),
            export: rel.split(':')[1] ?? 'default',
        }
    }

    // ---- 3. specToPath (client bundle) ----
    const specToPath = new Map<string, string>()

    const addSpec = (spec: string): void => {
        const file = spec.split(':')[0].replace(/^\.\//, '')
        if (specToPath.has(file)) return
        specToPath.set(file, resolveSpec(spec))
    }

    for (const route of routeTree.byId.values()) {
        addSpec(route.contentConfig.workspaceConfig.template)
        const layoutRel = config.client.layouts[route.type]
        if (layoutRel) addSpec(layoutRel)
        addSpec(route.contentConfig.prefetchConfig.configLoader)
    }
    for (const spec of factoryModules) addSpec(spec)
    for (const def of Object.values(globalFactories)) {
        addSpec(def.dataFactoryName)
    }

    // getMetaCallback — должен быть доступен в клиентском bundle
    for (const route of routeTree.byId.values()) {
        if (route.metaConfig?.getMetaCallback) {
            addSpec(route.metaConfig.getMetaCallback)
        }
    }

    // Компоненты (error / loading / notFound) — в client bundle.
    for (const key of ['error', 'loading', 'notFound'] as const) {
        const spec = config.client.components[key]
        if (spec) addSpec(spec)
    }

    // ---- 4. allSsrSpecs (SSR bundle) ----
    const allSsrSpecs = new Set<string>()
    for (const route of routeTree.byId.values()) {
        allSsrSpecs.add(route.contentConfig.workspaceConfig.template)
        const layoutRel = config.client.layouts[route.type]
        if (layoutRel) allSsrSpecs.add(layoutRel)
        allSsrSpecs.add(route.contentConfig.prefetchConfig.configLoader)
    }

    for (const spec of factoryModules) allSsrSpecs.add(spec)

    for (const def of Object.values(globalFactories)) {
        allSsrSpecs.add(def.dataFactoryName)
    }

    // getMetaCallback (SSR)
    for (const route of routeTree.byId.values()) {
        if (route.metaConfig?.getMetaCallback) {
            allSsrSpecs.add(route.metaConfig.getMetaCallback)
        }
    }

    // Компоненты (error / loading / notFound) — в SSR bundle.
    for (const key of ['error', 'loading', 'notFound'] as const) {
        const spec = config.client.components[key]
        if (spec) allSsrSpecs.add(spec)
    }

    const ssrModulePaths = new Map<string, string>()
    for (const spec of allSsrSpecs) {
        ssrModulePaths.set(spec, resolveSpec(spec))
    }

    // ---- 5. Middleware-пути (client-safe) ----
    const middlewareHandlers = new Set<string>()
    for (const mw of config.middleware ?? []) {
        if (isServerOnly(mw)) continue
        middlewareHandlers.add(mw.handler.split(':')[0])
    }
    for (const route of routeTree.byId.values()) {
        for (const mw of route.middleware ?? []) {
            if (isServerOnly(mw)) continue
            middlewareHandlers.add(mw.handler.split(':')[0])
        }
    }
    const middlewarePaths = new Map<string, string>()
    for (const handler of middlewareHandlers) {
        middlewarePaths.set(handler, resolveMiddlewarePath(handler))
    }

    // ---- 6. componentsMeta ----
    const componentsMeta: Record<string, { path: string; export: string } | null> = {}
    for (const key of ['error', 'loading', 'notFound'] as const) {
        const spec = config.client.components[key]
        if (spec) {
            const [, exportName = 'default'] = spec.split(':')
            componentsMeta[key] = {
                path: resolveSpec(spec),
                export: exportName,
            }
        } else {
            componentsMeta[key] = null
        }
    }

    // Реестр словарей снимаем один раз на старте: новые словари подхватятся
    // после перезапуска dev-сервера (так же, как маршруты из router.ts).
    const i18nRegistry = scanI18n(clientDir, config.i18n)
    // Нормализованные пути для сравнения в handleHotUpdate (watcher отдаёт forward-slash).
    const i18nDictFiles = new Set(Object.values(i18nRegistry).flatMap((dicts) => Object.values(dicts)).map(toPosix))

    return {
        name: 'tusten',
        resolveId(id) {
            // Префикс `\0` — соглашение Vite для virtual-модулей: такой id не должен
            // резолвиться на диск, поэтому резолвим сразу в `\0`-вариант.
            if (id === VIRTUAL_ROUTES) return RESOLVED_ROUTES
            if (id === VIRTUAL_ENTRY) return RESOLVED_ENTRY
            if (id === VIRTUAL_SSR_ENTRY) return RESOLVED_SSR_ENTRY
            // Пользовательский импорт — только `i18n!<Module>`. `i18n:` без `!` сюда не попадает:
            // внутренний `i18n:` доступен лишь через `\0`-id, который генерирует сам плагин.
            if (id.startsWith(I18N_USER_PREFIX)) return '\0' + I18N_VIRTUAL_PREFIX + id.slice(I18N_USER_PREFIX.length)
            // `i18n-dict:` приходит только из сгенерированного кода модуля (динамический import).
            if (id.startsWith(I18N_DICT_PREFIX)) return '\0' + id
            return null
        },
        async load(id) {
            if (id === RESOLVED_ROUTES) {
                return generateRoutesModule(
                    routesData,
                    routeTree.compiled,
                    layoutPaths,
                    specToPath,
                    middlewarePaths,
                    globalFactories,
                    componentsMeta,
                )
            }
            if (id === RESOLVED_ENTRY) return generateEntryModule(cssFiles)
            if (id === RESOLVED_SSR_ENTRY) {
                return generateSsrEntryModule(ssrModulePaths)
            }
            if (id.startsWith('\0' + I18N_VIRTUAL_PREFIX)) {
                const moduleName = id.slice(('\0' + I18N_VIRTUAL_PREFIX).length)
                return generateI18nModule(moduleName, i18nRegistry[moduleName] ?? {})
            }
            if (id.startsWith('\0' + I18N_DICT_PREFIX)) {
                // id вида `<Module>:<locale>`; locale не содержит `:` (валидируется в config.ts),
                // поэтому делим по последнему двоеточию.
                const rest = id.slice(('\0' + I18N_DICT_PREFIX).length)
                const sep = rest.lastIndexOf(':')
                const file = i18nRegistry[rest.slice(0, sep)]?.[rest.slice(sep + 1)]
                if (!file) return generateI18nDictModule({})
                this.addWatchFile(file)
                const source = fs.readFileSync(file, 'utf8')
                return generateI18nDictModule(parseDictionary(source, file))
            }
            return null
        },
        handleHotUpdate({ file, server }) {
            if (!i18nDictFiles.has(toPosix(file))) return
            // Словарь подгружается динамическим import() из virtual-модуля, который не является
            // HMR-границей. Проще и надёжнее сбросить кэш i18n-модулей и перезагрузить страницу.
            invalidateI18nModules(server)
            server.ws.send({ type: 'full-reload' })
            return []
        },
    }
}

/**
 * Приводит путь к forward-slash: Vite и watcher используют такой формат на всех ОС.
 *
 * @param p путь.
 * @returns путь с `/`.
 */
function toPosix(p: string): string {
    return p.replace(/\\/g, '/')
}

/**
 * Сбрасывает трансформ-кэш всех i18n virtual-модулей во всех окружениях
 * (клиент и SSR), чтобы следующий запрос перечитал JSON с диска.
 *
 * @param server dev-сервер Vite.
 */
function invalidateI18nModules(server: ViteDevServer): void {
    for (const env of Object.values(server.environments)) {
        for (const mod of env.moduleGraph.idToModuleMap.values()) {
            if (mod.id?.startsWith('\0' + I18N_VIRTUAL_PREFIX) || mod.id?.startsWith('\0' + I18N_DICT_PREFIX)) {
                env.moduleGraph.invalidateModule(mod)
            }
        }
    }
}

/** Запись маршрута для генерации. */
interface RouteEntry {
    id: string
    path: string
    title: string
    description: string | null
    templatePath: string
    templateExport: string
    middleware: MiddlewareDef[]
    meta: Record<string, unknown>
    metaConfig: import('../types').MetaConfig | null
    contentConfig: TustenRoute['contentConfig']
    layoutChain: string[]
}

/**
 * Генерирует `virtual:tusten/routes`.
 *
 * @param routesData маршруты.
 * @param compiledRoutes скомпилированные паттерны.
 * @param layoutPaths `type → { path, export }`.
 * @param specToPath spec → Vite-путь.
 * @param middlewarePaths handler → Vite-путь.
 * @param globalFactories глобальный реестр.
 * @param componentsMeta метаданные `error` / `loading` / `notFound`.
 * @returns код модуля.
 */
function generateRoutesModule(
    routesData: RouteEntry[],
    compiledRoutes: CompiledRoute[],
    layoutPaths: Record<string, { path: string; export: string }>,
    specToPath: Map<string, string>,
    middlewarePaths: Map<string, string>,
    globalFactories: FactoryMap,
    componentsMeta: Record<string, { path: string; export: string } | null>,
): string {
    const uniquePaths = new Set<string>()
    for (const p of specToPath.values()) uniquePaths.add(p)
    for (const p of middlewarePaths.values()) uniquePaths.add(p)

    const moduleLoaders = Array.from(uniquePaths)
        .map((p) => `  ${JSON.stringify(p)}: () => import(${JSON.stringify(p)})`)
        .join(',\n')

    const specToPathObj: Record<string, string> = {}
    for (const [spec, p] of specToPath) specToPathObj[spec] = p

    const middlewareLoaders = Array.from(middlewarePaths)
        .map(([h, p]) => `  ${JSON.stringify(h)}: () => import(${JSON.stringify(p)})`)
        .join(',\n')

    return `
const moduleLoaders = {
${moduleLoaders}
}

const specToPath = ${JSON.stringify(specToPathObj, null, 2)}

const middlewareLoaders = {
${middlewareLoaders}
}

const layoutPaths = ${JSON.stringify(layoutPaths, null, 2)}

export const components = ${JSON.stringify(componentsMeta, null, 2)}

export const routes = ${JSON.stringify(routesData, null, 2)}

export const globalFactories = ${JSON.stringify(globalFactories, null, 2)}

export const compiled = ${JSON.stringify(compiledRoutes, null, 2)}

/**
 * Находит маршрут по URL с матчингом параметров.
 *
 * @param {string} url путь.
 * @returns {{routeId: string, params: object} | null}
 */
export function matchRoute(url) {
  for (const r of compiled) {
    const m = new RegExp(r.regexSource).exec(url)
    if (m) {
      const params = {}
      for (let i = 0; i < r.paramNames.length; i++) {
        params[r.paramNames[i]] = decodeURIComponent(m[i + 1])
      }
      return { routeId: r.id, params }
    }
  }
  return null
}

/**
 * Находит запись маршрута по id.
 *
 * @param {string} id id.
 * @returns {object | null}
 */
export function findRouteById(id) {
  for (const r of routes) {
    if (r.id === id) return r
  }
  return null
}

export function findRouteByPath(path) {
  for (const r of routes) {
    if (r.path === path) return r
  }
  return null
}

export async function loadRouteModules(route) {
  // Шаблон и все layout грузим одним залпом: каждый последовательный
  // await — это отдельный RTT (на 3G сотни мс).
  const infos = (route.layoutChain || []).map((t) => layoutPaths[t]).filter(Boolean)
  const [templateMod, ...layoutMods] = await Promise.all([
    moduleLoaders[route.templatePath](),
    ...infos.map((info) => moduleLoaders[info.path]()),
  ])

  const Template = templateMod[route.templateExport]
  if (!Template) {
    throw new Error('Export "' + route.templateExport + '" not found in ' + route.templatePath)
  }

  const Layouts = layoutMods
    .map((mod, i) => mod[infos[i].export])
    .filter((Layout) => typeof Layout === 'function')

  return { Template, Layouts }
}

/**
 * Резолвит спеку в значение (default или именованный экспорт).
 *
 * @param {string} spec спека.
 * @returns {Promise<unknown>}
 */
export async function resolveModule(spec) {
  const [file, exportName = 'default'] = spec.split(':')
  const p = specToPath[file]
  if (!p) {
    throw new Error('Module not found in client bundle: ' + file)
  }
  const mod = await moduleLoaders[p]()
  const value = mod[exportName]
  if (value === undefined) {
    throw new Error('Export "' + exportName + '" not found in ' + p)
  }
  return value
}

/**
 * Резолвит компонент по componentsMeta.
 *
 * @param {{path: string, export: string} | null} info метаданные.
 * @returns {Promise<Function | null>}
 */
export async function resolveComponent(info) {
  if (!info) return null
  const loader = moduleLoaders[info.path]
  if (!loader) throw new Error('Component not in bundle: ' + info.path)
  const mod = await loader()
  return mod[info.export] || null
}

/**
 * Загружает прикладной класс слайса.
 *
 * @param {string} modulePath Vite-путь.
 * @param {string} exportName имя экспорта.
 * @returns {Promise<new () => any>}
 */
export async function loadSliceClass(modulePath, exportName) {
  const loader = moduleLoaders[modulePath]
  if (!loader) {
    throw new Error('Module not in client bundle: ' + modulePath)
  }
  const mod = await loader()
  const impl = mod[exportName]
  if (!impl || typeof impl.slice !== 'function') {
    throw new Error('Invalid factory impl at ' + modulePath + ':' + exportName)
  }
  return impl.slice
}

/**
 * Загружает модуль middleware.
 *
 * @param {string} handler ключ.
 * @returns {Promise<Function>}
 */
export async function loadMiddlewareModule(handler) {
  const loader = middlewareLoaders[handler]
  if (!loader) {
    throw new Error('Middleware not in client bundle: ' + handler)
  }
  const mod = await loader()
  const fn = mod.client || mod.default
  if (typeof fn !== 'function') {
    throw new Error('Middleware "' + handler + '" is not a function')
  }
  return fn
}
`
}

/**
 * Генерирует `virtual:tusten/client-entry`.
 *
 * @param cssFiles Vite-пути до глобальных CSS (`config.css`).
 * @returns код модуля.
 */
function generateEntryModule(cssFiles: string[] = []): string {
    const cssImport = cssFiles.map((file) => `import '${file}'`).join('\n')

    return `
${cssImport}
import { createElement } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { resolveMeta } from '@tusten/core'
import {
  RootProvider,
  RootErrorBoundary,
  RootLoading,
  RootNotFound,
  Slice,
  SliceRegistry,
  renderLayoutChain,
  runGlobalPrefetch,
  runPagePrefetch,
  devalueParse,
  initI18n,
  loadRegisteredDictionaries,
} from '@tusten/core/client'
import {
  findRouteById,
  matchRoute,
  loadRouteModules,
  loadSliceClass,
  loadMiddlewareModule,
  resolveModule,
  resolveComponent,
  globalFactories,
  components,
} from '${VIRTUAL_ROUTES}'

async function hydrateSlicesFromState(stateObj, registry) {
  if (!stateObj || !stateObj.slices) return
  const entries = Object.entries(stateObj.slices)
  await Promise.all(entries.map(async ([name, info]) => {
    let slice
    try {
      const SliceClass = await loadSliceClass(info.modulePath, info.exportName)
      slice = new SliceClass()
    } catch (err) {
      console.warn('[tusten] slice class not loaded for "' + name + '":', err)
      slice = new Slice()
    }
    slice.hydrate(info.state, info.config)
    if (info.scope === 'global') registry.setGlobal(name, slice)
    else registry.setPage(name, slice)
  }))
}

/**
 * Строит NavTarget: pathname для матчинга, query отдельно.
 *
 * @param {string} path полный путь (с query, если есть).
 * @returns {object} NavTarget.
 */
function buildNavTarget(path) {
  const url = new URL(path, window.location.origin)
  const matched = matchRoute(url.pathname)
  const route = matched ? findRouteById(matched.routeId) : null
  const params = matched ? matched.params : {}
  const query = {}
  url.searchParams.forEach((v, k) => { query[k] = v })
  return { path, pathname: url.pathname, params, query, route }
}

async function runClientMiddlewareChain(chain, to, from) {
  for (const def of chain) {
    const fn = await loadMiddlewareModule(def.handler)
    const result = await fn(def.params || {}, { to, from })
    if (result && typeof result === 'object' && 'redirect' in result) {
      return result
    }
  }
  return undefined
}

const globalClientMiddleware = (window.__ROOT_MIDDLEWARE__ || []).filter(
  (m) => !m.side || m.side === 'client' || m.side === 'both',
)

function isServerOnly(def) {
  if (def.side === 'server') return true
  if (def.side === 'client' || def.side === 'both') return false
  return def.handler.startsWith('server/')
}

function fullMiddlewareChain(route) {
  return [
    ...globalClientMiddleware,
    ...((route && route.middleware) || []),
  ].filter((def) => !isServerOnly(def))
}

/**
 * Клиентский prefetch: выполняет loadData через TustenService.
 *
 * @param {object} route маршрут.
 * @param {SliceRegistry} registry реестр слайсов.
 * @param {object} navTarget навигационный target.
 * @param {boolean} skipExisting пропустить загруженные глобальные.
 * @param {SliceRegistry} [pageRegistry] куда класть page-слайсы (по умолчанию — registry).
 */
async function clientPrefetch(route, registry, navTarget, skipExisting, pageRegistry) {
  const ctx = {
    route,
    globalRegistry: globalFactories,
    loadModule: resolveModule,
    registry,
    router: {
      id: route.id,
      path: navTarget.pathname,
      params: navTarget.params,
      query: navTarget.query,
      request: null,
    },
  }
  const globalStates = await runGlobalPrefetch(ctx, { skipExisting })
  await runPagePrefetch(
    pageRegistry ? { ...ctx, registry: pageRegistry } : ctx,
    globalStates,
  )
}

async function main() {
  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('tusten: #root element not found')

  // Locale и словари из HTML — до импорта модулей маршрута: их createRk-инстансы
  // создаются именно при импорте и сразу берут свой словарь.
  if (window.__ROOT_I18N__) initI18n(window.__ROOT_I18N__)

  const isSsr = window.__ROOT_SSR__ === true

  const initialPath = window.location.pathname
  const initialMatch = matchRoute(initialPath)
  const initialRoute = initialMatch ? findRouteById(initialMatch.routeId) : null

  // 404: SSR уже отрендерил кастомную NotFound через renderToString.
  if (!initialRoute) {
    const NotFoundComp =
      (await resolveComponent(components.notFound)) || RootNotFound
    const notFoundRouter = {
      path: initialPath,
      params: {},
      query: Object.fromEntries(new URLSearchParams(window.location.search)),
      routeId: '__not-found__',
    }
    const nfRegistry = new SliceRegistry()
    const nfTree = createElement(
      RootProvider,
      { sliceRegistry: nfRegistry, router: notFoundRouter },
      createElement(NotFoundComp),
    )
    if (isSsr) {
      hydrateRoot(rootEl, nfTree)
    } else {
      createRoot(rootEl).render(nfTree)
    }
    return
  }

  // Независимые чанки стартуют сразу, а не цепочкой: на 3G каждый
  // последовательный await — отдельный RTT. Loading нужен только в SPA:
  // при SSR его чанк не качаем. Ошибка загрузки кастомного Error не должна
  // ронять гидратацию — уходим на дефолтный boundary.
  const errorCompP = resolveComponent(components.error)
    .then((c) => c || undefined)
    .catch((err) => {
      console.warn('[tusten] failed to load custom error component:', err)
      return undefined
    })
  const loadingCompP = isSsr
    ? null
    : resolveComponent(components.loading).then((c) => c || RootLoading)

  const initialParams = initialMatch ? initialMatch.params : {}

  const sliceRegistry = new SliceRegistry()

  let currentRouter = {
    path: initialPath,
    params: initialParams,
    query: Object.fromEntries(new URLSearchParams(window.location.search)),
    routeId: initialRoute.id,
  }

  let rootRef
  let navSeq = 0

  const renderTree = async (route) => {
    const [{ Template, Layouts }, ErrorComp] = await Promise.all([
      loadRouteModules(route),
      errorCompP,
    ])
    // Словари после импорта модулей: только тогда известно, какие rk-функции существуют.
    // Уже засеянные из HTML словари сетевых запросов не вызывают.
    await loadRegisteredDictionaries()
    const child = createElement(Template)
    return createElement(
      RootErrorBoundary,
      { fallback: ErrorComp },
      renderLayoutChain(child, Layouts),
    )
  }

  const navigate = async (path, mode) => {
    const to = buildNavTarget(path)
    if (!to.route) {
      window.location[mode === 'replace' ? 'replace' : 'assign'](path)
      return
    }
    const from = buildNavTarget(window.location.pathname)

    try {
      const redirect = await runClientMiddlewareChain(
        fullMiddlewareChain(to.route), to, from,
      )
      if (redirect && redirect.redirect) {
        await navigate(redirect.redirect, 'replace')
        return
      }
    } catch (err) {
      console.error('[tusten] client middleware failed:', err)
      return
    }

    // Готовим page-слайсы новой страницы в отдельном реестре: старую
    // страницу убиваем только после успешного prefetch + загрузки шаблона,
    // иначе при ошибке пользователь остался бы на живой странице
    // с мёртвыми слайсами.
    const nextPages = new SliceRegistry()
    // Токен навигации: при быстрых кликах побеждает последний, устаревший
    // переход не должен перезаписать более свежую страницу.
    const navId = ++navSeq
    let newTree
    try {
      // Данные и чанки шаблона/layout независимы — грузим параллельно.
      ;[, newTree] = await Promise.all([
        clientPrefetch(to.route, sliceRegistry, to, true, nextPages),
        renderTree(to.route),
      ])
    } catch (err) {
      nextPages.disposePage()
      console.error('[tusten] client prefetch failed:', err)
      return
    }
    if (navId !== navSeq) {
      nextPages.disposePage()
      return
    }
    sliceRegistry.adoptPage(nextPages)

    if (mode === 'replace') {
      window.history.replaceState({}, '', path)
    } else {
      window.history.pushState({}, '', path)
    }
    document.title = to.route.title || 'tusten'
    const newRouter = {
      path: to.pathname,
      params: to.params,
      query: to.query,
      routeId: to.route.id,
    }
    currentRouter = newRouter

    rootRef.render(
      createElement(RootProvider, { sliceRegistry, router: newRouter }, newTree),
    )

    // Meta (может быть RPC) не блокирует переход: страница уже показана.
    // Только для маршрутов с metaConfig — иначе title из route не затирается
    // дефолтным заголовком. Устаревший ответ (юзер ушёл дальше) игнорируем.
    if (to.route.metaConfig) {
      void resolveMeta(
        to.route,
        { id: to.route.id, path: to.pathname, params: to.params, query: to.query, request: null },
        window.location.href,
        resolveModule,
      )
        .then((meta) => {
          if (navId === navSeq) document.title = meta.title
        })
        .catch((err) => console.debug('[tusten] meta skipped:', err))
    }
  }

  window.__rootNavigate = {
    push: (p) => navigate(p, 'push'),
    replace: (p) => navigate(p, 'replace'),
    back: () => window.history.back(),
    prefetch: async (p) => {
      const to = buildNavTarget(p)
      if (!to.route) return
      // Временный реестр: реальная работа идёт в TustenService cache.
      // При клике clientPrefetch выполнится снова, но service-вызовы
      // возьмутся из кэша → мгновенно. Сами слайсы-заготовки не нужны.
      const tempRegistry = new SliceRegistry()
      try {
        // Греем и данные, и чанки шаблона/layout: иначе клик всё равно
        // ждёт загрузки шаблона.
        await Promise.all([
          clientPrefetch(to.route, tempRegistry, to, false),
          loadRouteModules(to.route),
        ])
      } catch (err) {
        // Prefetch — best-effort. Ошибки не блокируют клик.
        console.debug('[tusten] prefetch skipped:', err)
      } finally {
        tempRegistry.disposePage()
      }
    },
  }

  window.addEventListener('popstate', () => {
    void navigate(window.location.pathname, 'replace')
  })

  const initialRouter = currentRouter

  if (isSsr) {
    let stateObj
    try {
      stateObj = window.__ROOT_STATE_STR__
        ? devalueParse(window.__ROOT_STATE_STR__)
        : undefined
    } catch (err) {
      console.warn('[tusten] failed to parse __ROOT_STATE_STR__:', err)
      stateObj = undefined
    }
    // Чанки шаблона/layout и классы слайсов грузятся параллельно:
    // это последний водопад перед hydrateRoot.
    const [initialTree] = await Promise.all([
      renderTree(initialRoute),
      hydrateSlicesFromState(stateObj, sliceRegistry),
    ])
    rootRef = hydrateRoot(
      rootEl,
      createElement(RootProvider, { sliceRegistry, router: initialRouter }, initialTree),
      {
        // Mismatch React чинит клиентским рендером (со скачком вёрстки):
        // делаем его заметным, а не молчаливым.
        onRecoverableError: (err) => {
          console.error('[tusten] hydration mismatch (client re-render):', err)
        },
      },
    )
  } else {
    // Шаблон и Loading грузятся параллельно; Loading показываем, пока идёт prefetch.
    const [initialTree, LoadingComp] = await Promise.all([renderTree(initialRoute), loadingCompP])
    rootRef = createRoot(rootEl)
    rootRef.render(
      createElement(
        RootProvider,
        { sliceRegistry, router: initialRouter },
        createElement(LoadingComp),
      ),
    )

    try {
      await clientPrefetch(initialRoute, sliceRegistry, {
        path: initialPath, pathname: initialPath, params: initialParams, query: initialRouter.query,
      }, false)
      document.title = initialRoute.title || 'tusten'
      rootRef.render(
        createElement(
          RootProvider,
          { sliceRegistry, router: initialRouter },
          initialTree,
        ),
      )
    } catch (err) {
      console.error('[tusten] initial prefetch failed:', err)
      const ErrorComp = await errorCompP
      const errorNode = ErrorComp
        ? createElement(ErrorComp, { error: err })
        : createElement(
            'div',
            { style: { padding: '1rem', color: 'crimson' } },
            'Error: ' + err.message,
          )
      rootRef.render(
        createElement(
          RootProvider,
          { sliceRegistry, router: initialRouter },
          errorNode,
        ),
      )
    }
  }
}

main().catch((err) => { console.error('[tusten] hydration failed:', err) })
`
}

/**
 * Генерирует `virtual:tusten/ssr-entry`.
 *
 * @param modulePaths карта spec → Vite-путь.
 * @returns код модуля.
 */
function generateSsrEntryModule(modulePaths: Map<string, string>): string {
    const byFile = new Map<string, string>()
    for (const [spec, vitePath] of modulePaths) {
        const file = spec.split(':')[0].replace(/^\.\//, '')
        if (!byFile.has(file)) byFile.set(file, vitePath)
    }

    const imports: string[] = []
    const entries: string[] = []
    let i = 0
    for (const [file, vitePath] of byFile) {
        const varName = `m_${i++}`
        imports.push(`import * as ${varName} from ${JSON.stringify(vitePath)}`)
        entries.push(`  ${JSON.stringify(file)}: ${varName}`)
    }

    return `
${imports.join('\n')}

export {
  RootProvider,
  SliceRegistry,
  renderLayoutChain,
  RootErrorBoundary,
  RootLoading,
  RootNotFound,
  setLocaleResolver,
  setI18nUsageHook,
  loadRegisteredDictionaries,
  getRegisteredDictionary,
} from '@tusten/core/client'

export const modules = {
${entries.join(',\n')}
}
`
}
