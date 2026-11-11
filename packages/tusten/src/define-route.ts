import type { TustenRoute } from './types'

/**
 * Обёртка над массивом маршрутов.
 *
 * Возвращает тот же массив, но даёт типизацию и точку расширения:
 * позже здесь можно добавлять валидацию во время выполнения
 * (например, проверку обязательных полей в dev-режиме).
 *
 * @param routes массив маршрутов, объявленных в `router.ts`.
 * @returns тот же массив, типобезопасно.
 *
 * @example
 * ```ts
 * export default defineRoute([
 *   {
 *     id: 'home',
 *     index: true,
 *     title: 'Главная',
 *     type: 'main',
 *     contentConfig: {
 *       workspaceConfig: { template: 'HomePage/view:View' },
 *       prefetchConfig: { configLoader: 'HomePage/Factories/Root' },
 *     },
 *   },
 * ])
 * ```
 */
export function defineRoute(routes: TustenRoute[]): TustenRoute[] {
    return routes
}
