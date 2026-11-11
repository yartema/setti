import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createJiti } from 'jiti'
import { TustenError } from '../errors'
import type { RpcObjectDefinition } from '../types'

/**
 * Рекурсивно собирает `*.meta.ts` / `*.meta.js` в каталоге.
 *
 * @param dir каталог.
 * @returns массив абсолютных путей.
 */
async function collectMetaFiles(dir: string): Promise<string[]> {
    let entries: import('node:fs').Dirent[]
    try {
        entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
        return []
    }

    const files: string[] = []
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...(await collectMetaFiles(full)))
        } else if (entry.isFile() && /\.meta\.(ts|js)$/.test(entry.name)) {
            files.push(full)
        }
    }
    return files
}

/**
 * Рекурсивно сканирует `serverDir/**\/*.meta.ts` и возвращает
 * определения объектов БЛ.
 *
 * Файл должен default-экспортировать `defineObject({...})`. Если файлов
 * нет — возвращает пустой массив.
 *
 * @param serverDir абсолютный путь до `serverDir`.
 * @returns массив определений.
 * @throws {TustenError} если структура файла невалидна.
 */
export async function scanRpcObjects(serverDir: string): Promise<RpcObjectDefinition[]> {
    const files = await collectMetaFiles(serverDir)
    if (files.length === 0) return []

    const jiti = createJiti(import.meta.url, { interopDefault: true, jsx: true })
    const result: RpcObjectDefinition[] = []

    for (const abs of files) {
        const mod = (await jiti.import(abs)) as Record<string, unknown>
        const def = mod.default

        if (!def || typeof def !== 'object') {
            throw new TustenError(`RPC meta file "${abs}" must default-export defineObject({...})`)
        }

        const obj = def as RpcObjectDefinition
        if (typeof obj.name !== 'string') {
            throw new TustenError(`RPC meta file "${abs}": missing "name"`)
        }
        if (!obj.methods || typeof obj.methods !== 'object') {
            throw new TustenError(`RPC meta file "${abs}" (${obj.name}): missing "methods"`)
        }

        result.push(obj)
    }

    return result
}
