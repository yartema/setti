import path from 'node:path'
import { createJiti } from 'jiti'
import type { NixoConfig, ResolvedNixoConfig } from './types'
import { NixoError } from './errors'
import { fileExists } from './utils/fs'

/**
 * Загружает `nixo.config.ts` из указанного каталога.
 *
 * Использует `jiti` для поддержки TypeScript без предварительной сборки.
 *
 * @param projectDir корень проекта (где лежит `nixo.config.ts`).
 * @returns нормализованный конфиг с дефолтами.
 * @throws {NixoError} если конфиг не найден или не экспортирует объект.
 */
export async function loadConfig(projectDir: string): Promise<ResolvedNixoConfig> {
    const configPath = path.join(projectDir, 'nixo.config.ts')
    const altPath = path.join(projectDir, 'nixo.config.js')

    // Ищем .ts, потом .js.
    const target = (await fileExists(configPath))
        ? configPath
        : (await fileExists(altPath))
            ? altPath
            : null

    if (!target) {
        throw new NixoError(
            `Config not found: expected "nixo.config.ts" or "nixo.config.js" in ${projectDir}`,
        )
    }

    // jiti грузит TS/ESM и возвращает default export.
    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        jsx: true,
    })
    const mod = (await jiti.import(target, { default: true })) as NixoConfig | undefined

    if (!mod || typeof mod !== 'object') {
        throw new NixoError(`Config at ${target} must export a default object`)
    }

    // Нормализуем дефолты — единая точка, где заданы значения по умолчанию.
    return {
        ssr: mod.ssr ?? true,
        clientDir: mod.clientDir ?? 'client',
        serverDir: mod.serverDir ?? 'server',
        layouts: mod.layouts ?? {},
        middleware: mod.middleware ?? [],
        server: {
            port: mod.server?.port ?? 3000,
            host: mod.server?.host ?? 'localhost',
            routes: mod.server?.routes ?? null,
            plugins: mod.server?.plugins ?? null,
        },
        vite: mod.vite ?? {},
        build: { outDir: mod.build?.outDir ?? 'dist' },
        css: {
            main: mod.css?.main ?? 'styles/main.css',
        },
        runtimeConfig: { public: mod.runtimeConfig?.public ?? {} },
        fastify: mod.fastify ?? {},
        rpc:
            mod.rpc === false
                ? {
                    enabled: false,
                    url: '/service',
                    describe: false,
                    extendContext: undefined,
                }
                : {
                    enabled: mod.rpc?.enabled ?? true,
                    url: mod.rpc?.url ?? '/service',
                    describe: mod.rpc?.describe ?? true,
                    extendContext: mod.rpc?.extendContext,
                },
        components: {
            error: mod.components?.error ?? null,
            loading: mod.components?.loading ?? null,
            notFound: mod.components?.notFound ?? null,
        },
    }
}