import { promises as fs, realpathSync } from 'node:fs'
import path from 'node:path'

/**
 * Приводит путь к реальному регистру на диске.
 *
 * На Windows/macOS ФС регистронезависима: спека `HomePage/view` находит
 * `View.tsx`, но модуль регистрируется во Vite под id `.../view.tsx`.
 * Вотчер присылает `.../View.tsx`, инвалидация не находит модуль — HMR
 * «не видит» правки, и dev приходится перезапускать.
 *
 * `realpathSync.native` (в отличие от JS-версии `realpathSync`) возвращает
 * канонический регистр, так что id модуля совпадает с путём из watcher'а.
 *
 * @param absPath абсолютный путь.
 * @returns путь с реальным регистром (входной, если файла нет).
 */
export function resolveRealPath(absPath: string): string {
    try {
        return realpathSync.native(absPath)
    } catch {
        return absPath
    }
}

/**
 * Абсолютный путь → Vite-путь (`/client/HomePage/view.tsx`).
 *
 * Обе стороны (`projectDir` и файл) приводятся к канонической форме: на
 * Windows `os.tmpdir()` может вернуть короткое имя (`C:\Users\AV-BAR~1\...`),
 * а `realpathSync.native` — длинное (`C:\Users\av.barcev\...`). Без этого
 * `path.relative` даёт `../../../../..` вместо `/client/...`.
 *
 * @param projectDir корень проекта (Vite root).
 * @param absPath абсолютный путь до файла.
 * @returns Vite-путь с каноническим регистром.
 */
export function toVitePath(projectDir: string, absPath: string): string {
    const root = resolveRealPath(projectDir)
    const abs = resolveRealPath(absPath)
    return '/' + path.relative(root, abs).replace(/\\/g, '/')
}

/**
 * Проверяет, что путь существует и является файлом.
 *
 * @param filePath абсолютный путь.
 * @returns `true`, если файл существует.
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(filePath)
        return stat.isFile()
    } catch {
        return false
    }
}

/**
 * Рекурсивно обходит каталог и вызывает колбэк для каждого файла.
 *
 * Симлинки не разворачиваем (важно для `node_modules`, чтобы не зациклиться).
 *
 * @param dir стартовый каталог.
 * @param onFile колбэк для каждого файла (абсолютный путь).
 */
export async function walkFiles(dir: string, onFile: (filePath: string) => Promise<void> | void): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
        // Пропускаем node_modules и прочий шум.
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            await walkFiles(full, onFile)
        } else if (entry.isFile()) {
            await onFile(full)
        }
    }
}
