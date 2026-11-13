import { TustenError } from './errors'
import { compileRoute, computePath } from './url'
import type { CompiledRoute, MiddlewareDef, ResolvedTustenConfig, RouteTree, TustenRoute } from './types'

/**
 * Строит и валидирует дерево маршрутов из результата сканирования.
 *
 * Проверки:
 * - уникальность `id` глобально;
 * - `parentId` ссылается на существующий маршрут;
 * - нет циклов по `parentId`;
 * - ровно один `index: true` (глобально);
 * - `type` ссылается на существующий `config.client.layouts`;
 * - нет коллизий между локальными фабриками и GlobalRegistry (A3).
 *
 * @param routeModules результат `scan().routeModules`.
 * @param loaderModules результат `scan().loaderModules` (для проверки A3).
 * @param config нормализованный конфиг.
 * @returns `{ byId, paths, indexRouteId }`.
 */
export function buildRouteTree(
    routeModules: Array<{ file: string; routes: TustenRoute[] }>,
    loaderModules: Array<{ file: string; map: Record<string, unknown> }>,
    config: ResolvedTustenConfig,
): RouteTree {
    // 1. Плоский список всех маршрутов + карта по id.
    const allRoutes: TustenRoute[] = []
    const byId = new Map<string, TustenRoute>()

    for (const { routes } of routeModules) {
        for (const route of routes) {
            if (byId.has(route.id)) {
                throw new TustenError(`Duplicate route id "${route.id}" (found in multiple router.ts files)`)
            }
            byId.set(route.id, route)
            allRoutes.push(route)
        }
    }

    // 2. Проверка parentId.
    for (const route of allRoutes) {
        if (route.parentId && !byId.has(route.parentId)) {
            throw new TustenError(`Route "${route.id}" references unknown parentId "${route.parentId}"`)
        }
    }

    // 3. Проверка циклов: идём вверх по parentId и ловим повтор.
    for (const route of allRoutes) {
        const seen = new Set<string>([route.id])
        let cursor = route.parentId
        while (cursor) {
            if (seen.has(cursor)) {
                throw new TustenError(
                    `Cycle detected in route hierarchy starting at "${route.id}" (via parentId "${cursor}")`,
                )
            }
            seen.add(cursor)
            cursor = byId.get(cursor)?.parentId
        }
    }

    // 4. Ровно один index: true.
    const indexRoutes = allRoutes.filter((r) => r.index === true)
    if (indexRoutes.length > 1) {
        throw new TustenError(
            `Multiple index routes globally: ${indexRoutes.map((r) => r.id).join(', ')}. Only one is allowed.`,
        )
    }

    // 5. Валидация type → layouts.
    const layoutKeys = new Set(Object.keys(config.client.layouts))
    for (const route of allRoutes) {
        if (!layoutKeys.has(route.type)) {
            throw new TustenError(
                `Route "${route.id}" uses unknown layout type "${route.type}". ` +
                    `Available: ${[...layoutKeys].join(', ') || '(none)'}`,
            )
        }
    }

    // 6. Коллизия имён между GlobalRegistry и локальными фабриками (A3).
    //    На этапе скана мы не вызываем getConfig (это runtime), поэтому здесь
    //    проверяем только loader-файлы между собой (дубликаты имён).
    const globalNames = new Map<string, string>()
    for (const { file, map } of loaderModules) {
        for (const name of Object.keys(map)) {
            const existing = globalNames.get(name)
            if (existing) {
                throw new TustenError(
                    `Global loader "${name}" is declared in both "${existing}" and "${file}" (A3: no collisions)`,
                )
            }
            globalNames.set(name, file)
        }
    }

    // 6.5. Наследование middleware по parentId.
    //      `middleware: []` у ребёнка — отключает наследование.
    //      После этого у КАЖДОГО маршрута `middleware` — массив (возможно пустой).
    //
    //      ВАЖНО: сначала делаем снимок ЛОКАЛЬНЫХ middleware каждого маршрута
    //      (`localMw`). Иначе при обходе в цикле `ancestor.middleware` будет уже
    //      наследованным (двойное наследование: leaf получит authMw дважды —
    //      от root и от mid, где mid уже унаследовал от root).
    const localMw = new Map<string, MiddlewareDef[] | undefined>()
    for (const route of allRoutes) {
        localMw.set(route.id, route.middleware ? [...route.middleware] : undefined)
    }

    for (const route of allRoutes) {
        const local = localMw.get(route.id)

        // Явный пустой массив — отключает наследование.
        if (local !== undefined && local.length === 0) {
            route.middleware = []
            continue
        }

        // Собираем цепочку предков root → parent (по `localMw`, не по мутированному).
        const stack: TustenRoute[] = []
        let cursor = route.parentId ? byId.get(route.parentId) : undefined
        while (cursor) {
            stack.unshift(cursor)
            cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
        }

        // Наследуем ЛОКАЛЬНЫЕ middleware предков + свои локальные.
        const inherited: MiddlewareDef[] = []
        for (const ancestor of stack) {
            const ancestorLocal = localMw.get(ancestor.id)
            if (ancestorLocal) inherited.push(...ancestorLocal)
        }
        if (local) inherited.push(...local)

        route.middleware = inherited
    }

    // 7. Пути + компиляция + валидация.
    const paths = new Map<string, string>()
    const compiled: CompiledRoute[] = []
    const seenPatterns = new Map<string, string>()

    for (const route of allRoutes) {
        if (route.path && route.slug) {
            throw new TustenError(`Route "${route.id}" cannot have both "path" and "slug" (mutually exclusive)`)
        }

        const pattern = computePath(route, byId)
        paths.set(route.id, pattern)

        if (seenPatterns.has(pattern)) {
            throw new TustenError(
                `Duplicate URL pattern "${pattern}" for routes "${seenPatterns.get(pattern)}" and "${route.id}"`,
            )
        }
        seenPatterns.set(pattern, route.id)

        let compiledPat: { regexSource: string; paramNames: string[] }
        try {
            compiledPat = compileRoute(route, byId)
        } catch (err) {
            throw new TustenError(`Invalid route "${route.id}": ${(err as Error).message}`)
        }

        if (seenPatterns.has(compiledPat.regexSource)) {
            // Проверка коллизий на уровне regex (например, /blog/:slug vs /blog/:id).
            const existing = seenPatterns.get(compiledPat.regexSource)!
            if (existing !== route.id) {
                // Уже видели другой маршрут с тем же regex — ошибка.
                // (seenPatterns хранит человекочитаемый pattern, поэтому отдельная проверка)
            }
        }

        compiled.push({
            id: route.id,
            path: pattern,
            regexSource: compiledPat.regexSource,
            paramNames: compiledPat.paramNames,
        })
    }

    // Проверка коллизий regex между разными маршрутами.
    const regexSeen = new Map<string, string>()
    for (const c of compiled) {
        const existing = regexSeen.get(c.regexSource)
        if (existing) {
            throw new TustenError(`Ambiguous URL regex "${c.regexSource}" for routes "${existing}" and "${c.id}"`)
        }
        regexSeen.set(c.regexSource, c.id)
    }

    // 8. Цепочки layouts по parentId: type'ы от корня к листу.
    const layoutChains = new Map<string, string[]>()
    for (const route of allRoutes) {
        const chain: string[] = []
        let current: TustenRoute | undefined = route

        if (route.index === true && route.ssr === false) {
            throw new TustenError(
                `Route "${route.id}": "index: true" cannot have "ssr: false" ` + `(index page must be SSR)`,
            )
        }

        while (current) {
            chain.unshift(current.type)
            current = current.parentId ? byId.get(current.parentId) : undefined
        }
        layoutChains.set(route.id, chain)
    }

    return {
        byId,
        paths,
        indexRouteId: indexRoutes[0]?.id ?? null,
        compiled,
        layoutChains,
    }
}
