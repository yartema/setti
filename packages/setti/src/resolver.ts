import path from 'node:path'
import { createJiti } from 'jiti'
import type { Jiti } from 'jiti'
import { SettiError } from './errors'
import { interpolate } from './utils/interpolate'

/**
 * Внутренний резолвер модулей. Инициализируется один раз
 * при старте фреймворка (или CLI) и затем используется через
 * публичный `resolveModule`.
 */
let internalResolver: ((spec: string, vars?: Record<string, unknown>) => Promise<unknown>) | null = null

/**
 * Инициализирует внутренний резолвер.
 *
 * @param options опции инициализации.
 * @param options.clientDir абсолютный путь до клиентского каталога.
 * @param options.jiti опциональный экземпляр jiti (для тестов/инъекции).
 */
export function __initResolver(options: { clientDir: string; jiti?: Jiti }): void {
    const jiti =
        options.jiti ??
        createJiti(import.meta.url, {
            interopDefault: true,
            jsx: true,
        })

    internalResolver = async (spec: string, vars: Record<string, unknown> = {}): Promise<unknown> => {
        // 1. Подставляем переменные, если они есть (public API поддерживает переменные).
        const resolved = vars && Object.keys(vars).length > 0 ? interpolate(spec, vars) : spec

        // 2. Отделяем путь до файла от имени экспорта (`<file>:<export>`).
        const [filePath, exportName] = resolved.split(':')

        // 3. Резолвим абсолютный путь.
        const absPath = path.resolve(options.clientDir, filePath)

        // 4. Грузим модуль через jiti.
        const mod = (await jiti.import(absPath)) as Record<string, unknown>

        // 5. Возвращаем именованный экспорт или default.
        const value = exportName ? mod[exportName] : mod.default
        if (value === undefined) {
            throw new SettiError(
                `Module "${resolved}" resolved to undefined. ` +
                    (exportName
                        ? `Export "${exportName}" not found in "${absPath}"`
                        : `No default export in "${absPath}"`),
            )
        }
        return value
    }
}

/**
 * Публичный резолвер модулей.
 *
 * Поддерживает:
 * - статические строки: `resolveModule('HomePage/view:View')`;
 * - пути с переменными-плейсхолдерами: `resolveModule('{dir}/view:View', { dir: 'HomePage' })`;
 * - пути, переданные через переменную JS (это автоматически, никакой статики);
 * - default (`'HomePage/Factories/Root'`) и именованный (`':View'`) экспорты.
 *
 * @param spec спецификация модуля.
 * @param vars значения плейсхолдеров (опционально).
 * @returns экспортированное значение.
 * @throws {SettiError} если резолвер не инициализирован или модуль не найден.
 */
export async function resolveModule(spec: string, vars?: Record<string, unknown>): Promise<unknown> {
    if (!internalResolver) {
        throw new SettiError(
            'resolveModule() called before setti was initialized. ' +
                'Call __initResolver() from the framework entry point.',
        )
    }
    return internalResolver(spec, vars)
}
