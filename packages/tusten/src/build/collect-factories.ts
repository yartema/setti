import path from 'node:path'
import { createJiti } from 'jiti'
import type {
    FactoryMap,
    ResolvedTustenConfig,
    RouteTree,
    ScanResult,
} from '../types'

/**
 * Собирает все `dataFactoryName` из `getConfig` каждого маршрута и из
 * `*.loader.ts`. Результат используется:
 *   - в Vite-плагине — для генерации `factoryLoaders` в `virtual:tusten/routes`
 *     (клиент грузит прикладной класс слайса через `import()`);
 *   - в SSR-сборке — чтобы Vite включил эти модули в `dist/server`.
 *
 * `getConfig` может зависеть от runtime (замыкания, env) — ошибка
 * проглатывается с предупреждением, сборка не блокируется.
 *
 * @param projectDir корень проекта.
 * @param routeTree дерево маршрутов.
 * @param scanResult результат сканирования (`*.loader.ts`).
 * @param clientDir абсолютный путь до клиентского каталога.
 * @returns уникальные спеки `<file>:<export>`.
 */
export async function collectFactoryModules(
    projectDir: string,
    routeTree: RouteTree,
    scanResult: ScanResult,
    clientDir: string,
): Promise<string[]> {
    void projectDir
    const jiti = createJiti(import.meta.url, { interopDefault: true, jsx: true })
    const out = new Set<string>()

    for (const route of routeTree.byId.values()) {
        const cfgSpec = route.contentConfig.prefetchConfig.configLoader
        const [file, exportName] = cfgSpec.split(':')
        const abs = path.resolve(clientDir, file)
        try {
            const mod = (await jiti.import(abs)) as Record<string, unknown>
            const getConfig = (exportName ? mod[exportName] : mod.default) as
                | ((
                params: Record<string, unknown>,
                router: unknown,
            ) => Promise<FactoryMap> | FactoryMap)
                | undefined
            if (typeof getConfig !== 'function') continue

            const router = {
                id: route.id,
                path: routeTree.paths.get(route.id) ?? '/',
                params: {},
                query: {},
                request: {},
            }
            const factoryMap = await getConfig(
                route.contentConfig.prefetchConfig.configParams ?? {},
                router,
            )
            for (const def of Object.values(factoryMap)) {
                out.add(def.dataFactoryName)
            }
        } catch (err) {
            console.warn(
                `[tusten] collectFactoryModules: getConfig of route "${route.id}" failed: ${(err as Error).message}`,
            )
        }
    }

    for (const { map } of scanResult.loaderModules) {
        for (const def of Object.values(map)) out.add(def.dataFactoryName)
    }

    return [...out]
}

/**
 * Дополнительная функция — не используется, оставлена для будущих
 * валидаторов (например, проверки `config` в `prefetchConfig`).
 *
 * @param _config конфиг.
 */
export function _unused(_config: ResolvedTustenConfig): void {
    void _config
}