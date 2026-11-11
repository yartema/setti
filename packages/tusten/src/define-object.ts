import type { RpcObjectDefinition } from './types'

/**
 * Обёртка над определением объекта БЛ.
 *
 * Используется в `server/*.meta.ts` — один объект на файл.
 *
 * @param def определение объекта.
 * @returns то же определение.
 *
 * @example
 * ```ts
 * export default defineObject({
 *   name: 'Users',
 *   description: 'Пользователи',
 *   methods: {
 *     List: { handler: async (params, ctx) => ctx.db.users.findMany() },
 *   },
 * })
 * ```
 */
export function defineObject(def: RpcObjectDefinition): RpcObjectDefinition {
    return def
}
