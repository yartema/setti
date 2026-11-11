import path from 'node:path'
import { promises as fs } from 'node:fs'
import { stringify as devalueStringify } from 'devalue'
import type { PrefetchSliceInfo } from './prefetch'

/**
 * Формат `__ROOT_STATE_STR__`, который внедряется в HTML.
 *
 * Сериализуется через `devalue` — поддерживает `Map`, `Set`, `Date`,
 * `BigInt`, `undefined`, `NaN`, `Infinity`, `-0`, циклические ссылки.
 * Функции **не** сериализуются (`devalue` бросит ошибку) — их надо
 * восстанавливать в `_initState` слайса.
 */
export interface SerializedState {
    version: 1
    slices: Record<
        string,
        {
            modulePath: string
            exportName: string
            state: unknown
            scope: 'page' | 'global'
        }
    >
}

/**
 * Проверяет существование файла.
 *
 * @param filePath абсолютный путь.
 * @returns `true` если есть.
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(filePath)
        return stat.isFile()
    } catch {
        return false
    }
}

/**
 * Резолвит спеку (`HomePage/Factories/usersList:UserListLoader`) в
 * Vite-путь (`/client/HomePage/Factories/usersList.tsx`) + имя экспорта.
 *
 * @param projectDir корень проекта.
 * @param clientDir клиентский каталог.
 * @param spec спека.
 * @returns путь от Vite-root и имя экспорта.
 * @throws {Error} если модуль не найден.
 */
async function resolveModulePath(
    projectDir: string,
    clientDir: string,
    spec: string,
): Promise<{ modulePath: string; exportName: string }> {
    const [file, exportName = 'default'] = spec.split(':')
    const absBase = path.resolve(clientDir, file)

    for (const ext of ['.tsx', '.ts', '.jsx', '.js', '']) {
        const abs = absBase + ext
        if (await fileExists(abs)) {
            const fromRoot = '/' + path.relative(projectDir, abs).replace(/\\/g, '/')
            return { modulePath: fromRoot, exportName }
        }
    }
    throw new Error(`Module not found: ${spec} (resolved from ${absBase})`)
}

/**
 * Формирует объект `__ROOT_STATE_STR__` из слайсов prefetch.
 *
 * @param slices карта `name → PrefetchSliceInfo`.
 * @param projectDir корень проекта.
 * @param clientDir клиентский каталог.
 * @returns сериализуемый объект.
 */
export async function serializeState(
    slices: Map<string, PrefetchSliceInfo>,
    projectDir: string,
    clientDir: string,
): Promise<SerializedState> {
    const out: SerializedState = { version: 1, slices: {} }

    for (const [name, info] of slices) {
        const { modulePath, exportName } = await resolveModulePath(projectDir, clientDir, info.dataFactoryName)
        out.slices[name] = {
            modulePath,
            exportName,
            state: info.state,
            scope: info.scope,
        }
    }
    return out
}

/**
 * Сериализует состояние в строку через `devalue`.
 *
 * `devalue` сохраняет `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`,
 * `Infinity`, `-0` и циклические ссылки. Функции — ошибка (восстанавливать
 * в `_initState`).
 *
 * Возвращает **JSON-строку** (не JS-объект). На клиенте её надо
 * распарсить через `devalue.parse`. `<` экранируется, чтобы `</script>`
 * в данных не сломал HTML.
 *
 * @param state сериализуемое состояние.
 * @returns JSON-строка для `devalue.parse`.
 * @throws {Error} если сериализация невозможна (циклы без `devalue`, функции).
 */
export function stringifyState(state: SerializedState): string {
    try {
        return devalueStringify(state).replace(/</g, '\\u003c')
    } catch (err) {
        throw new Error(`Failed to serialize __ROOT_STATE_STR__ (devalue): ${(err as Error).message}`)
    }
}
