import { promises as fs } from 'node:fs'
import path from 'node:path'

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
