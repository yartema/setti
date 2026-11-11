import { Service } from '../client/rpc/Service'
import { TustenError } from '../errors'
import type { MetaConfig, MetaResult, MetaTag, PageMeta, TustenRoute, TustenRouter } from '../types'

const DEFAULT_TITLE = 'Страница'

/**
 * Разбирает `'Blogs.ReadMetaInfo'` → `{ endpoint: 'Blogs', method: 'ReadMetaInfo' }`.
 *
 * @param spec спецификация метода.
 * @returns endpoint (опционально) и method.
 */
function parseReadMethod(spec: string): { endpoint?: string; method: string } {
    const dot = spec.lastIndexOf('.')
    if (dot === -1) return { method: spec }
    return { endpoint: spec.slice(0, dot), method: spec.slice(dot + 1) }
}

/**
 * Резолвит meta для маршрута.
 *
 * 1. `readMethod` → `Service.call(method, url)`.
 * 2. Иначе `getMetaCallback` → `fn(metaConfig)`.
 * 3. Мерж со статикой: `meta` конкатенируется, `microdata` — shallow merge.
 * 4. `title` = `metaConfig.title ?? 'Страница'`.
 *
 * Ошибка метода — `console.warn` + только статика. SSR не падает.
 *
 * @param route маршрут.
 * @param router контекст (path, params, query).
 * @param url полный URL (для readMethod).
 * @param loadModule загрузчик (для getMetaCallback).
 * @returns готовая meta.
 */
export async function resolveMeta(
    route: TustenRoute,
    router: TustenRouter,
    url: string,
    loadModule: (spec: string) => Promise<unknown>,
): Promise<PageMeta> {
    const cfg: MetaConfig = route.metaConfig ?? {}
    const staticMeta: MetaTag[] = cfg.meta ?? []
    const staticMicrodata = cfg.microdata ?? {}
    const title = cfg.title ?? DEFAULT_TITLE

    let fromMethod: MetaResult = {}

    if (cfg.readMethod) {
        const { endpoint, method } = parseReadMethod(cfg.readMethod)
        try {
            const svc = new Service({ endpoint, cache: cfg.cache })
            const data = await svc.call<MetaResult>(method, url)
            fromMethod = data ?? {}
        } catch (err) {
            console.warn(`[tusten] readMethod "${cfg.readMethod}" failed for route "${route.id}":`, err)
        }
    } else if (cfg.getMetaCallback) {
        try {
            const fn = (await loadModule(cfg.getMetaCallback)) as ((c: MetaConfig) => Promise<MetaResult>) | undefined
            if (typeof fn !== 'function') {
                throw new TustenError(`getMetaCallback "${cfg.getMetaCallback}" is not a function`)
            }
            fromMethod = (await fn(cfg)) ?? {}
        } catch (err) {
            console.warn(`[tusten] getMetaCallback "${cfg.getMetaCallback}" failed for route "${route.id}":`, err)
        }
    }

    return {
        title: fromMethod.title ?? title,
        meta: [...staticMeta, ...(fromMethod.meta ?? [])],
        microdata: { ...staticMicrodata, ...(fromMethod.microdata ?? {}) },
    }
}
