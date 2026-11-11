import path from 'node:path'
import { createJiti } from 'jiti'
import type { TustenConfig, ResolvedTustenConfig } from './types'
import { TustenError } from './errors'
import { fileExists } from './utils/fs'

/**
 * Загружает `tusten.config.ts` из указанного каталога.
 *
 * Использует `jiti` для поддержки TypeScript без предварительной сборки.
 *
 * @param projectDir корень проекта (где лежит `tusten.config.ts`).
 * @returns нормализованный конфиг с дефолтами.
 * @throws {TustenError} если конфиг не найден или не экспортирует объект.
 */
export async function loadConfig(projectDir: string): Promise<ResolvedTustenConfig> {
    const configPath = path.join(projectDir, 'tusten.config.ts')
    const altPath = path.join(projectDir, 'tusten.config.js')

    // Ищем .ts, потом .js.
    const target = (await fileExists(configPath)) ? configPath : (await fileExists(altPath)) ? altPath : null

    if (!target) {
        throw new TustenError(`Config not found: expected "tusten.config.ts" or "tusten.config.js" in ${projectDir}`)
    }

    // jiti грузит TS/ESM и возвращает default export.
    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        jsx: true,
    })

    // jiti с `export default null` может упасть внутри (Cannot read 'then').
    // Ловим и превращаем в понятную ошибку.
    let mod: TustenConfig | undefined
    try {
        const moduleNs = (await jiti.import(target)) as { default?: TustenConfig } | null | undefined
        mod = moduleNs?.default
    } catch {
        mod = undefined
    }

    if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
        throw new TustenError(`Config at ${target} must export a default object`)
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
