import path from 'node:path'
import { createJiti } from 'jiti'
import { fileExists } from '../utils/fs'
import { TustenError } from '../errors'
import type { MiddlewareDef } from '../types'

/** Сторона, для которой грузим middleware. */
export type MiddlewareSide = 'client' | 'server'

/** Функция-middleware (универсальная для client/server). */
export type MiddlewareFn = (params: Record<string, unknown>, ctx: unknown) => Promise<unknown>

/**
 * Резолвит `MiddlewareDef.handler` в функцию.
 *
 * Формат `handler`: `<file>:<export>` или `<file>` (default).
 *
 * Для `side: 'both'` — файл экспортирует `client` и `server`, берём нужный.
 * Для `side: 'client'` / `'server'` — default или named-экспорт.
 *
 * @param def объявление middleware.
 * @param projectDir корень проекта.
 * @param side сторона.
 * @returns функция-middleware.
 * @throws {TustenError} если файл/экспорт не найден или не функция.
 */
export async function loadMiddleware(
    def: MiddlewareDef,
    projectDir: string,
    side: MiddlewareSide,
): Promise<MiddlewareFn> {
    const [file, exportName] = def.handler.split(':')
    const base = path.resolve(projectDir, file)
    let abs: string | null = null
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
        if (await fileExists(base + ext)) {
            abs = base + ext
            break
        }
    }
    if (!abs) {
        throw new TustenError(`Middleware "${def.id}" not found: ${def.handler} (resolved from ${base})`)
    }

    const jiti = createJiti(import.meta.url, { interopDefault: true, jsx: true })
    const mod = (await jiti.import(abs)) as Record<string, unknown>

    // Приоритет: named export (если задан) → named по side (для both) → default.
    let fn: unknown = undefined
    if (exportName) {
        fn = mod[exportName]
    } else if (def.side === 'both' && typeof mod[side] === 'function') {
        fn = mod[side]
    } else {
        fn = mod.default
    }

    if (typeof fn !== 'function') {
        throw new TustenError(
            `Middleware "${def.id}" at ${abs}: expected function${
                def.side === 'both' ? ` export "${side}" or default` : ' (default or named)'
            }`,
        )
    }
    return fn as MiddlewareFn
}
