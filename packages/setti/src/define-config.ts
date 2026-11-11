import type { SettiConfig } from './types'

/**
 * JSDoc-обёртка для `setti.config.ts` — даёт типобезопасность.
 *
 * Pure-функция (без jiti/fastify) — можно импортировать из любого окружения.
 *
 * @param config объект конфигурации.
 * @returns тот же объект.
 */
export function defineSettiConfig(config: SettiConfig): SettiConfig {
    return config
}