import type { ServerRoute } from './types'

/**
 * Обёртка над массивом API-роутов.
 *
 * Используется в файле `server/api/routes.ts` (или ином пути из
 * `config.server.routes`). Даёт типобезопасность и точку расширения
 * (валидация в dev — позже).
 *
 * @param routes массив роутов.
 * @returns тот же массив.
 *
 * @example
 * ```ts
 * export default defineServerRoutes([
 *   {
 *     method: 'GET',
 *     path: '/api/users',
 *     handler: 'server/api/handlers/users:listUsers',
 *   },
 * ])
 * ```
 */
export function defineServerRoutes(routes: ServerRoute[]): ServerRoute[] {
    return routes
}
