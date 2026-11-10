import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createJiti } from 'jiti'
import type { ServerPluginDef, ServerPluginsOptions } from '../types'

/**
 * Загружает список Fastify-плагинов из каталога `config.server.plugins`.
 *
 * Скан `*.ts` / `*.js` (кроме `index`). Порядок:
 *   1. Если есть `index.ts` с `defineServerPlugins({ order })` — по нему.
 *   2. Остальные — в конце, алфавитно.
 *   3. Без `index.ts` — всё алфавитно.
 *
 * @param projectDir корень проекта.
 * @param pluginsDir путь из конфига (относительно `projectDir`).
 * @returns массив `{ name, path }` (path — абсолютный).
 */
export async function loadServerPlugins(
    projectDir: string,
    pluginsDir: string,
): Promise<ServerPluginDef[]> {
    const abs = path.resolve(projectDir, pluginsDir)

    let entries: import('node:fs').Dirent[]
    try {
        const stat = await fs.stat(abs)
        if (!stat.isDirectory()) return []
        entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
        return []
    }

    // Порядок — из index.ts, если есть.
    let order: string[] | null = null
    for (const indexName of ['index.ts', 'index.js']) {
        const indexPath = path.join(abs, indexName)
        try {
            const jiti = createJiti(import.meta.url, { interopDefault: true })
            const idxMod = (await jiti.import(indexPath, { default: true })) as
                | ServerPluginsOptions
                | undefined
            if (idxMod && Array.isArray(idxMod.order)) order = idxMod.order
            break
        } catch {
            // index.ts отсутствует или невалиден — не блокируем.
        }
    }

    const plugins: ServerPluginDef[] = []
    for (const entry of entries) {
        if (!entry.isFile()) continue
        if (entry.name === 'index.ts' || entry.name === 'index.js') continue
        if (!/\.(ts|js)$/.test(entry.name)) continue
        const name = entry.name.replace(/\.(ts|js)$/, '')
        plugins.push({ name, path: path.join(abs, entry.name) })
    }

    if (order) {
        const orderMap = new Map(order.map((n, i) => [n, i]))
        plugins.sort((a, b) => {
            const ai = orderMap.get(a.name) ?? Number.POSITIVE_INFINITY
            const bi = orderMap.get(b.name) ?? Number.POSITIVE_INFINITY
            if (ai !== bi) return ai - bi
            return a.name.localeCompare(b.name)
        })
    } else {
        plugins.sort((a, b) => a.name.localeCompare(b.name))
    }

    return plugins
}