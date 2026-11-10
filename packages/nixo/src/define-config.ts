import type { NixoConfig } from './types'

/**
 * JSDoc-обёртка для `nixo.config.ts` — даёт типобезопасность.
 *
 * Pure-функция (без jiti/fastify) — можно импортировать из любого окружения.
 *
 * @param config объект конфигурации.
 * @returns тот же объект.
 */
export function defineNixoConfig(config: NixoConfig): NixoConfig {
    return config
}