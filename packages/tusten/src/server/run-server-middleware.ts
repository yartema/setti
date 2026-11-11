import { loadMiddleware } from './middleware-loader'
import type { MiddlewareDef, TustenRoute, TustenRouter } from '../types'
import type { SliceRegistry } from '../client/slices/SliceRegistry'

/** Контекст серверного middleware. */
export interface ServerMiddlewareContext {
    /** Текущий маршрут. */
    router: TustenRouter
    /** Описание маршрута. */
    route: TustenRoute
    /** Реестр слайсов (только global уже загружены). */
    globalSlices: SliceRegistry
}

/** Результат цепочки. */
export type ServerMiddlewareResult = { redirect: string } | void

/**
 * Прогоняет цепочку серверных middleware.
 *
 * Порядок: глобальные → (наследованные по parentId) → локальные.
 * Наследованные уже собраны в `route.middleware` в `route-tree.ts`.
 *
 * Пропускает:
 *   - `def.side === 'client'` — client-only;
 *   - `def.handler` начинается с `client/` — client-only по расположению.
 *
 * @param globalMiddleware из `config.middleware` (side='server'|'both').
 * @param route маршрут.
 * @param ctx контекст.
 * @param projectDir корень проекта.
 * @returns `{ redirect }` при остановке, иначе `void`.
 */
export async function runServerMiddleware(
    globalMiddleware: MiddlewareDef[],
    route: TustenRoute,
    ctx: ServerMiddlewareContext,
    projectDir: string,
): Promise<ServerMiddlewareResult> {
    const chain = [...globalMiddleware, ...(route.middleware ?? [])].filter((def) => {
        // Явный side: client → пропускаем.
        if (def.side === 'client') return false
        // Явный side: server / both → оставляем.
        if (def.side === 'server' || def.side === 'both') return true
        // side не задан — определяем по пути: client/* → client-only.
        if (def.handler.startsWith('client/')) return false
        return true
    })

    for (const def of chain) {
        const fn = await loadMiddleware(def, projectDir, 'server')
        const result = await (
            fn as (params: Record<string, unknown>, ctx: ServerMiddlewareContext) => Promise<ServerMiddlewareResult>
        )(def.params ?? {}, ctx)
        if (result && typeof result === 'object' && 'redirect' in result) {
            return result
        }
    }
    return undefined
}
