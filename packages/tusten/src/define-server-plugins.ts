import type { ServerPluginsOptions } from './types'

/**
 * Обёртка над опциями Fastify-плагинов.
 *
 * Используется в `server/plugins/index.ts` для задания порядка регистрации.
 * Если `index.ts` нет — плагины регистрируются в алфавитном порядке.
 *
 * @param options опции (порядок).
 * @returns те же опции.
 *
 * @example
 * ```ts
 * export default defineServerPlugins({
 *   order: ['cors', 'helmet', 'rateLimit'],
 * })
 * ```
 */
export function defineServerPlugins(options: ServerPluginsOptions): ServerPluginsOptions {
    return options
}
