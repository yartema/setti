import path from 'node:path'
import fs from 'node:fs'
import type { Plugin } from 'vite'
import type { CompiledRoute, FactoryMap, MiddlewareDef, TustenRoute, ResolvedTustenConfig, RouteTree } from '../types'

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
    /** Vite-путь до `css.main`. */
    cssMain?: string
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
    const { projectDir, clientDir, config, routeTree, factoryModules = [], globalFactories = {}, cssMain } = options

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
        return '/' + path.relative(projectDir, finalAbs).replace(/\\/g, '/')
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
        return '/' + path.relative(projectDir, finalAbs).replace(/\\/g, '/')
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
    for (const [type, rel] of Object.entries(config.layouts)) {
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
        const layoutRel = config.layouts[route.type]
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
        const spec = config.components[key]
        if (spec) addSpec(spec)
    }

    // ---- 4. allSsrSpecs (SSR bundle) ----
    const allSsrSpecs = new Set<string>()
    for (const route of routeTree.byId.values()) {
        allSsrSpecs.add(route.contentConfig.workspaceConfig.template)
        const layoutRel = config.layouts[route.type]
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
        const spec = config.components[key]
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
        const spec = config.components[key]
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

    return {
        name: 'tusten',
        resolveId(id) {
            if (id === VIRTUAL_ROUTES) return RESOLVED_ROUTES
            if (id === VIRTUAL_ENTRY) return RESOLVED_ENTRY
            if (id === VIRTUAL_SSR_ENTRY) return RESOLVED_SSR_ENTRY
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
            if (id === RESOLVED_ENTRY) return generateEntryModule(cssMain)
            if (id === RESOLVED_SSR_ENTRY) {
                return generateSsrEntryModule(ssrModulePaths)
            }
            return null
        },
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
  const templateMod = await moduleLoaders[route.templatePath]()
  const Template = templateMod[route.templateExport]
  if (!Template) {
    throw new Error('Export "' + route.templateExport + '" not found in ' + route.templatePath)
  }

  const Layouts = []
  for (const type of (route.layoutChain || [])) {
    const info = layoutPaths[type]
    if (!info) continue
    const layoutMod = await moduleLoaders[info.path]()
    const Layout = layoutMod[info.export]
    if (typeof Layout === 'function') Layouts.push(Layout)
  }

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
 * @param cssMain Vite-путь до `css.main`.
 * @returns код модуля.
 */
function generateEntryModule(cssMain?: string): string {
    const cssImport = cssMain ? `import '${cssMain}'` : ''

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
    slice.hydrate(info.state)
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
 */
async function clientPrefetch(route, registry, navTarget, skipExisting) {
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
  await runPagePrefetch(ctx, globalStates)
}

async function main() {
  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('tusten: #root element not found')

  const LoadingComp = (await resolveComponent(components.loading)) || RootLoading
  const ErrorComp = (await resolveComponent(components.error)) || undefined

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
    if (window.__ROOT_SSR__ === true) {
      hydrateRoot(rootEl, nfTree)
    } else {
      createRoot(rootEl).render(nfTree)
    }
    return
  }

  const initialParams = initialMatch ? initialMatch.params : {}

  const sliceRegistry = new SliceRegistry()

  let currentRouter = {
    path: initialPath,
    params: initialParams,
    query: Object.fromEntries(new URLSearchParams(window.location.search)),
    routeId: initialRoute.id,
  }

  let rootRef

  const renderTree = async (route) => {
    const { Template, Layouts } = await loadRouteModules(route)
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

    try {
      sliceRegistry.disposePage()
      await clientPrefetch(to.route, sliceRegistry, to, true)
    } catch (err) {
      console.error('[tusten] client prefetch failed:', err)
      return
    }

    const newTree = await renderTree(to.route)

    const meta = await resolveMeta(
      to.route,
      { id: to.route.id, path: to.pathname, params: to.params, query: to.query, request: null },
      window.location.href,
      resolveModule,
    )
    document.title = meta.title

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
  }

  window.__rootNavigate = {
    push: (p) => navigate(p, 'push'),
    replace: (p) => navigate(p, 'replace'),
    back: () => window.history.back(),
    prefetch: async (p) => {
      const to = buildNavTarget(p)
      if (!to.route) return
      try {
        // Временный registry — реальная работа идёт в TustenService cache.
        // При клике clientPrefetch выполнится снова, но service-вызовы
        // возьмутся из кэша → мгновенно.
        const tempRegistry = new SliceRegistry()
        await clientPrefetch(to.route, tempRegistry, to, false)
      } catch (err) {
        // Prefetch — best-effort. Ошибки не блокируют клик.
        console.debug('[tusten] prefetch skipped:', err)
      }
    },
  }

  window.addEventListener('popstate', () => {
    void navigate(window.location.pathname, 'replace')
  })

  const initialRouter = currentRouter
  const initialTree = await renderTree(initialRoute)

  if (window.__ROOT_SSR__ === true) {
    let stateObj
    try {
      stateObj = window.__ROOT_STATE_STR__
        ? devalueParse(window.__ROOT_STATE_STR__)
        : undefined
    } catch (err) {
      console.warn('[tusten] failed to parse __ROOT_STATE_STR__:', err)
      stateObj = undefined
    }
    await hydrateSlicesFromState(stateObj, sliceRegistry)
    rootRef = hydrateRoot(
      rootEl,
      createElement(RootProvider, { sliceRegistry, router: initialRouter }, initialTree),
    )
  } else {
    // Показываем Loading, пока идёт prefetch.
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
} from '@tusten/core/client'

export const modules = {
${entries.join(',\n')}
}
`
}
