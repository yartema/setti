import path from 'node:path'
import { createJiti } from 'jiti'
import type { TustenConfig, ResolvedTustenConfig, TustenI18nConfig } from './types'
import { TustenError } from './errors'
import { fileExists } from './utils/fs'
import { isValidLocale } from './shared/locale'

/**
 * Нормализует секцию `i18n`. Отсутствие секции — не ошибка, а выключенная фича.
 *
 * @param raw сырой объект из `tusten.config.ts`.
 * @returns нормализованные настройки или `null`.
 * @throws {TustenError} если `locales` пуст, содержит некорректный формат
 *   или `defaultLocale` не входит в `locales`.
 */
export function normalizeI18n(raw: TustenI18nConfig | undefined): TustenI18nConfig | null {
    if (raw === undefined) return null

    const { defaultLocale, locales } = raw
    if (!Array.isArray(locales) || locales.length === 0) {
        throw new TustenError('i18n.locales must be a non-empty array of locale codes')
    }
    for (const locale of locales) {
        if (!isValidLocale(locale)) {
            throw new TustenError(`i18n.locales contains invalid locale "${String(locale)}" (expected e.g. "en", "pt-BR")`)
        }
    }
    if (!locales.includes(defaultLocale)) {
        throw new TustenError(`i18n.defaultLocale "${defaultLocale}" must be one of i18n.locales [${locales.join(', ')}]`)
    }

    // Дубликаты не несут смысла и могли бы породить двойные записи в реестре словарей.
    return { defaultLocale, locales: [...new Set(locales)] }
}

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
    const rpcConfig = mod.server?.rpc

    return {
        ssr: mod.ssr ?? true,
        client: {
            clientDir: mod.client?.clientDir ?? 'client',
            layouts: mod.client?.layouts ?? {},
            css: mod.client?.css ?? [],
            components: {
                error: mod.client?.components?.error ?? null,
                loading: mod.client?.components?.loading ?? null,
                notFound: mod.client?.components?.notFound ?? null,
            },
        },
        server: {
            serverDir: mod.server?.serverDir ?? 'server',
            port: mod.server?.port ?? 3000,
            host: mod.server?.host ?? 'localhost',
            routes: mod.server?.routes ?? null,
            plugins: mod.server?.plugins ?? null,
            rpc:
                rpcConfig === false
                    ? {
                          enabled: false,
                          url: '/service',
                          describe: false,
                          extendContext: undefined,
                      }
                    : {
                          enabled: rpcConfig?.enabled ?? true,
                          url: rpcConfig?.url ?? '/service',
                          describe: rpcConfig?.describe ?? true,
                          extendContext: rpcConfig?.extendContext,
                      },
        },
        middleware: mod.middleware ?? [],
        vite: mod.vite ?? {},
        build: { outDir: mod.build?.outDir ?? 'dist' },
        runtimeConfig: { public: mod.runtimeConfig?.public ?? {} },
        fastify: mod.fastify ?? {},
        i18n: normalizeI18n(mod.i18n),
    }
}
