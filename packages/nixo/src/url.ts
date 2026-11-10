import type { CompiledRoute, NixoRoute } from './types'

/**
 * Экранирует regex-спецсимволы в строке.
 *
 * @param s строка.
 * @returns экранированная строка.
 */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Возвращает базовые id-сегменты (цепочка `parentId → id`, без `index`).
 *
 * @param route маршрут.
 * @param byId карта.
 * @returns сегменты в порядке root → leaf.
 */
function idSegments(route: NixoRoute, byId: Map<string, NixoRoute>): string[] {
    const segments: string[] = []
    let current: NixoRoute | undefined = route
    while (current) {
        if (!current.index) segments.unshift(current.id)
        current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return segments
}

/**
 * Строит человекочитаемый URL-паттерн маршрута.
 *
 * - `path` — как есть.
 * - Иначе: `/<id-chain>[/<slug-сегменты>]`.
 *
 * Для regex-сегментов возвращает `:slug`, `:slug1`, ... (для отображения).
 *
 * @param route маршрут.
 * @param byId карта.
 * @returns паттерн.
 */
export function computePath(
    route: NixoRoute,
    byId: Map<string, NixoRoute>,
): string {
    if (route.path) return route.path

    const segments = idSegments(route, byId)

    if (route.slug) {
        let ri = 0
        for (const s of route.slug) {
            if (s.startsWith('/regex:')) {
                segments.push(ri === 0 ? ':slug' : `:slug${ri}`)
                ri++
            } else {
                segments.push(s)
            }
        }
    }

    return '/' + segments.join('/')
}

/**
 * Компилирует regex-паттерн из `path` (формат `:param`).
 *
 * @param pattern паттерн (`/blog/:slug`).
 * @returns `regexSource` и `paramNames`.
 * @throws {Error} при невалидном паттерне.
 */
function compilePath(pattern: string): {
    regexSource: string
    paramNames: string[]
} {
    if (!pattern.startsWith('/')) {
        throw new Error(`Path must start with "/": "${pattern}"`)
    }
    const segments = pattern.split('/').filter(Boolean)
    const paramNames: string[] = []
    const parts = segments.map((seg) => {
        if (seg.startsWith(':')) {
            const name = seg.slice(1)
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                throw new Error(`Invalid param name "${name}" in pattern "${pattern}"`)
            }
            paramNames.push(name)
            return '([^/]+)'
        }
        return escapeRegex(seg)
    })
    return { regexSource: '^/' + parts.join('/') + '$', paramNames }
}

/**
 * Компилирует маршрут в regex с учётом `path` / `slug`.
 *
 * - `path` → `compilePath(path)`.
 * - Иначе: `/<id-chain>` + slug-сегменты:
 *   - `:param` → `([^/]+)` + `paramNames.push(param)`;
 *   - `/regex:body` → `(body)` + `paramNames.push('slug'| 'slug1'|...)`;
 *   - `literal` → экранированный литерал.
 *
 * @param route маршрут.
 * @param byId карта.
 * @returns `regexSource` и `paramNames`.
 * @throws {Error} при невалидном slug-сегменте.
 */
export function compileRoute(
    route: NixoRoute,
    byId: Map<string, NixoRoute>,
): { regexSource: string; paramNames: string[] } {
    if (route.path) return compilePath(route.path)

    const parts: string[] = []
    const paramNames: string[] = []

    for (const seg of idSegments(route, byId)) {
        parts.push(escapeRegex(seg))
    }

    if (route.slug) {
        let ri = 0
        for (const s of route.slug) {
            if (s.startsWith('/regex:')) {
                const body = s.slice('/regex:'.length)
                if (!body) {
                    throw new Error(
                        `Empty regex in slug for route "${route.id}": "${s}"`,
                    )
                }
                parts.push(`(${body})`)
                paramNames.push(ri === 0 ? 'slug' : `slug${ri}`)
                ri++
            } else if (s.startsWith(':')) {
                const name = s.slice(1)
                if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                    throw new Error(
                        `Invalid param name "${name}" in slug for route "${route.id}"`,
                    )
                }
                parts.push('([^/]+)')
                paramNames.push(name)
            } else {
                parts.push(escapeRegex(s))
            }
        }
    }

    return { regexSource: '^/' + parts.join('/') + '$', paramNames }
}

/**
 * Находит маршрут по URL.
 *
 * @param url путь.
 * @param compiled скомпилированные паттерны.
 * @returns `{ routeId, params }` или `null`.
 */
export function matchRoute(
    url: string,
    compiled: CompiledRoute[],
): { routeId: string; params: Record<string, string> } | null {
    for (const r of compiled) {
        const m = new RegExp(r.regexSource).exec(url)
        if (m) {
            const params: Record<string, string> = {}
            for (let i = 0; i < r.paramNames.length; i++) {
                params[r.paramNames[i]] = decodeURIComponent(m[i + 1])
            }
            return { routeId: r.id, params }
        }
    }
    return null
}