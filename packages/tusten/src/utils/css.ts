import path from 'node:path'
import type { ResolvedTustenConfig } from '../types'

/**
 * Резолвит `config.client.css` в Vite-пути от `projectDir`
 * (`styles/main.css` → `/client/styles/main.css`).
 *
 * @param projectDir корень проекта.
 * @param clientDir клиентский каталог.
 * @param config нормализованный конфиг.
 * @returns Vite-пути до глобальных CSS (пустой массив, если не заданы).
 */
export function resolveCssPaths(projectDir: string, clientDir: string, config: ResolvedTustenConfig): string[] {
    return config.client.css.map((rel) => {
        const abs = path.resolve(clientDir, rel)
        return '/' + path.relative(projectDir, abs).replace(/\\/g, '/')
    })
}
