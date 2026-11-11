import path from 'node:path'
import { createJiti } from 'jiti'
import { fileExists } from '../utils/fs'
import { SettiError } from '../errors'
import type { ServerRoute } from '../types'

/**
 * Загружает файл с `defineServerRoutes([...])` по пути из
 * `config.server.routes`.
 *
 * Проверяет, что default-экспорт — массив, и каждый элемент имеет
 * `method`, `path`, `handler`.
 *
 * @param projectDir корень проекта.
 * @param routesPath путь из конфига (относительно `projectDir`).
 * @returns массив API-роутов.
 * @throws {SettiError} если файл не найден или структура невалидна.
 */
export async function loadServerRoutes(projectDir: string, routesPath: string): Promise<ServerRoute[]> {
    const abs = path.resolve(projectDir, routesPath)

    if (!(await fileExists(abs))) {
        throw new SettiError(`server.routes not found: ${abs}`)
    }

    const jiti = createJiti(import.meta.url, { interopDefault: true })
    const mod = (await jiti.import(abs)) as Record<string, unknown>
    const routes = mod.default

    if (!Array.isArray(routes)) {
        throw new SettiError(`server.routes at "${abs}" must default-export an array (defineServerRoutes([...]))`)
    }

    for (const [i, r] of routes.entries()) {
        if (!r || typeof r !== 'object') {
            throw new SettiError(`Route at index ${i} in "${abs}" must be an object`)
        }
        const route = r as Record<string, unknown>
        if (typeof route.method !== 'string') {
            throw new SettiError(`Route at index ${i} in "${abs}": missing "method"`)
        }
        if (typeof route.path !== 'string') {
            throw new SettiError(`Route at index ${i} in "${abs}": missing "path"`)
        }
        if (typeof route.handler !== 'string') {
            throw new SettiError(`Route at index ${i} in "${abs}": missing "handler"`)
        }
    }

    return routes as ServerRoute[]
}
