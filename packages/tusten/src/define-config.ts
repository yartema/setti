import type { TustenConfig } from './types'

/**
 * JSDoc-обёртка для `tusten.config.ts` — даёт типобезопасность.
 *
 * Pure-функция (без jiti/fastify) — можно импортировать из любого окружения.
 *
 * @param config объект конфигурации.
 * @returns тот же объект.
 */
export function defineConfig(config: TustenConfig): TustenConfig {
    return config
}
