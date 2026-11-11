import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ViteDevServer } from 'vite'
import { TustenError } from '../errors'

/**
 * Dev-загрузчик модулей через `vite.ssrLoadModule`.
 *
 * @param clientDir абсолютный путь до клиентского каталога.
 * @param vite Vite dev-сервер.
 * @returns async-функция `(spec) => Promise<unknown>`.
 */
export function createDevModuleLoader(clientDir: string, vite: ViteDevServer): (spec: string) => Promise<unknown> {
    return async (spec: string): Promise<unknown> => {
        const [file, exportName] = spec.split(':')
        const abs = path.resolve(clientDir, file)
        const mod = (await vite.ssrLoadModule(abs)) as Record<string, unknown>
        const value = exportName ? mod[exportName] : mod.default
        if (value === undefined) {
            throw new TustenError(
                `Module "${spec}" resolved to undefined. ` +
                    (exportName ? `Export "${exportName}" not found in "${abs}"` : `No default export in "${abs}"`),
            )
        }
        return value
    }
}

/**
 * Prod-загрузчик модулей из собранного `dist/server/entry.js`.
 *
 * `entry.js` экспортирует `modules: { [specWithoutExport]: ns }`.
 * Резолвит `<file>` и `<file>:<export>` в соответствующее значение.
 *
 * @param serverEntryPath абсолютный путь до `dist/server/entry.js`.
 * @returns async-функция `(spec) => Promise<unknown>`.
 */
export function createProdModuleLoader(serverEntryPath: string): (spec: string) => Promise<unknown> {
    let cached: Promise<Record<string, Record<string, unknown>>> | null = null

    const ensureLoaded = (): Promise<Record<string, Record<string, unknown>>> => {
        if (!cached) {
            cached = import(pathToFileURL(serverEntryPath).href).then(
                (mod) => (mod as { modules: Record<string, Record<string, unknown>> }).modules,
            )
        }
        return cached
    }

    return async (spec: string): Promise<unknown> => {
        const modules = await ensureLoaded()
        const [file, exportName] = spec.split(':')
        const ns = modules[file]
        if (!ns) {
            throw new TustenError(
                `Module "${file}" not found in SSR bundle "${serverEntryPath}". ` +
                    `Available: ${Object.keys(modules).join(', ')}`,
            )
        }
        const value = exportName ? ns[exportName] : ns.default
        if (value === undefined) {
            throw new TustenError(`Export "${exportName ?? 'default'}" not found in module "${file}"`)
        }
        return value
    }
}
