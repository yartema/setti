import path from 'node:path'
import type { ResolvedNixoConfig } from '../types'

/**
 * Резолвит `config.css.main` в Vite-путь от `projectDir`
 * (`/client/styles/main.css`).
 *
 * @param projectDir корень проекта.
 * @param clientDir клиентский каталог.
 * @param config нормализованный конфиг.
 * @returns Vite-путь или undefined, если `css.main` не задан.
 */
export function resolveCssMainPath(
    projectDir: string,
    clientDir: string,
    config: ResolvedNixoConfig,
): string | undefined {
    if (!config.css.main) return undefined
    const abs = path.resolve(clientDir, config.css.main)
    return '/' + path.relative(projectDir, abs).replace(/\\/g, '/')
}
