import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createJiti } from 'jiti'
import type { FactoryMap, TustenRoute, ScanResult } from './types'
import { TustenError } from './errors'
import { fileExists, walkFiles } from './utils/fs'

/**
 * Сканнер клиентского каталога.
 *
 * 1. Ищет `router.ts` на первом уровне подкаталогов `clientDir` и
 *    вызывает из него `defineRoute()`.
 * 2. Рекурсивно ищет `*.loader.ts` и собирает карты глобальных загрузчиков.
 *
 * @param clientDir абсолютный путь до `clientDir`.
 * @returns результат сканирования с модулями и их содержимым.
 */
export async function scan(clientDir: string): Promise<ScanResult> {
    // jiti обрабатывает .ts в рантайме без отдельной сборки.
    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        jsx: true,
    })

    const routeModules: ScanResult['routeModules'] = []
    const loaderModules: ScanResult['loaderModules'] = []

    // --- Шаг 1: router.ts на первом уровне подкаталогов clientDir ---
    let topLevelEntries: import('node:fs').Dirent[]
    try {
        topLevelEntries = await fs.readdir(clientDir, { withFileTypes: true })
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            // Несуществующий clientDir — это пустой проект, не ошибка.
            return { routeModules: [], loaderModules: [] }
        }
        throw new TustenError(`Failed to read clientDir "${clientDir}": ${(err as Error).message}`)
    }

    for (const entry of topLevelEntries) {
        if (!entry.isDirectory()) continue
        // Пропускаем node_modules, .cache, .git — не пользовательский код.
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const routerPath = path.join(clientDir, entry.name, 'router.ts')

        if (!(await fileExists(routerPath))) continue

        const mod = (await jiti.import(routerPath)) as Record<string, unknown>
        const routes = mod.default
        if (!Array.isArray(routes)) {
            throw new TustenError(`router.ts at "${routerPath}" must default-export an array (use defineRoute([...]))`)
        }
        // Проверяем, что элементы похожи на TustenRoute — минимум обязательных полей.
        for (const [i, route] of routes.entries()) {
            if (!route || typeof route !== 'object' || typeof (route as TustenRoute).id !== 'string') {
                throw new TustenError(`Invalid route at index ${i} in "${routerPath}": missing "id"`)
            }
        }
        routeModules.push({ file: routerPath, routes: routes as TustenRoute[] })
    }

    // --- Шаг 2: рекурсивный поиск *.loader.ts ---
    await walkFiles(clientDir, async (file) => {
        if (!file.endsWith('.loader.ts') && !file.endsWith('.loader.js')) return

        const mod = (await jiti.import(file)) as Record<string, unknown>
        const rawMap = mod.default
        if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
            throw new TustenError(`Loader file "${file}" must default-export a factory map (defineGlobalLoader({...}))`)
        }
        const map = rawMap as FactoryMap
        // Валидация: каждая фабрика должна иметь `dataFactoryName: string`.
        for (const [name, def] of Object.entries(map)) {
            if (
                !def ||
                typeof def !== 'object' ||
                typeof (def as { dataFactoryName?: unknown }).dataFactoryName !== 'string'
            ) {
                throw new TustenError(`Loader "${name}" in "${file}" must have "dataFactoryName: string"`)
            }
        }

        loaderModules.push({ file, map: map as FactoryMap })
    })

    return { routeModules, loaderModules }
}
