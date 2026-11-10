import type { FactoryMap } from './types'

/**
 * Обёртка над картой глобальных загрузчиков.
 *
 * Формат совпадает с возвращаемым значением `getConfig` в `configLoader`.
 * Файл должен называться `*.loader.ts` и лежать в любом месте `clientDir` —
 * сканнер найдёт его автоматически.
 *
 * @param map карта фабрик `имя → описание`.
 * @returns та же карта.
 *
 * @example
 * ```ts
 * // client/User.loader.ts
 * export default defineGlobalLoader({
 *   userInfo: {
 *     dataFactoryName: 'User/loaders/userInfo:UserInfoLoader',
 *   },
 * })
 * ```
 */
export function defineGlobalLoader(map: FactoryMap): FactoryMap {
    return map
}
