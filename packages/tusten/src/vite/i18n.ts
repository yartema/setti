import { TustenError } from '../errors'

/**
 * Генераторы virtual-модулей i18n для Vite-плагина.
 *
 * Клиентский код импортирует `i18n!<Module>` — получает `rk` для этого модуля.
 * Плагин переводит такой импорт во внутренний virtual-id `\0i18n:<Module>`, который
 * генерирует модуль с `createRk`. Словари подгружаются отдельными чанками через `import()`,
 * поэтому каждый словарь — свой модуль `i18n-dict:<Module>:<locale>`.
 *
 * Модули чистые (без доступа к файлам): чтение с диска делает плагин, здесь
 * только разбор и генерация кода — это удобно тестировать.
 */

/**
 * Единственный пользовательский синтаксис импорта: `import rk from 'i18n!HomePage'`.
 * Тип объявлен в `types/i18n.d.ts` (`declare module 'i18n!*'`).
 */
export const I18N_USER_PREFIX = 'i18n!'

/**
 * Префикс внутреннего virtual-id модуля `\0i18n:<Module>`. Пользовательский код его
 * не импортирует: `i18n:<Module>` без `!` плагин не резолвит.
 */
export const I18N_VIRTUAL_PREFIX = 'i18n:'

/**
 * Префикс внутреннего id словаря. Используется и в сгенерированном коде
 * (`import('i18n-dict:...')`), и в `resolveId` (с добавлением `\0`).
 */
export const I18N_DICT_PREFIX = 'i18n-dict:'

/**
 * Разбирает содержимое `lang/<locale>/<locale>.json`.
 *
 * Битый JSON — единственная ошибка, которую здесь считаем «синтаксической»:
 * её видно на сборке, а не в рантайме, где молча показался бы ключ.
 *
 * @param source содержимое файла.
 * @param file путь до файла (для сообщения об ошибке).
 * @returns словарь `ключ → перевод`.
 * @throws {TustenError} если JSON невалиден, корень не объект или значение не строка.
 */
export function parseDictionary(source: string, file: string): Record<string, string> {
    let parsed: unknown
    try {
        parsed = JSON.parse(source)
    } catch (err) {
        throw new TustenError(`Invalid JSON in i18n dictionary "${file}": ${(err as Error).message}`)
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TustenError(`i18n dictionary "${file}" must be a JSON object { "key": "translation" }`)
    }

    // Нестроковое значение (число, вложенный объект) сломает контракт `rk(): string`
    // и `template()`: лучше упасть на сборке с понятным файлом, чем получить `[object Object]`.
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'string') {
            throw new TustenError(`i18n dictionary "${file}": value for key "${key}" must be a string`)
        }
    }

    return parsed as Record<string, string>
}

/**
 * Генерирует код virtual-модуля `\0i18n:<Module>`.
 *
 * Загрузчики — только для существующих словарей: отсутствующая locale в
 * `loaders` означает «переводить не будем», и `rk` вернёт исходный ключ.
 *
 * @param moduleName имя модуля (папка в `clientDir`).
 * @param dicts реестр `locale → абсолютный путь` для этого модуля.
 * @returns JS-код модуля.
 */
export function generateI18nModule(moduleName: string, dicts: Record<string, string>): string {
    const loaders = Object.keys(dicts).map((locale) => {
        const dictId = `${I18N_DICT_PREFIX}${moduleName}:${locale}`
        return `    ${JSON.stringify(locale)}: () => import(${JSON.stringify(dictId)}),`
    })

    return [
        // Имя пакета — `@tusten/core`; `tusten/client` в рантайме не резолвится.
        `import { createRk } from '@tusten/core/client'`,
        `export default createRk(${JSON.stringify(moduleName)}, {`,
        ...loaders,
        `})`,
        '',
    ].join('\n')
}

/**
 * Генерирует код virtual-модуля словаря `i18n-dict:<Module>:<locale>`.
 *
 * JSON — валидное JS-выражение (ES2019+), поэтому кладём его как есть.
 *
 * @param dict уже разобранный словарь.
 * @returns JS-код модуля с `export default`.
 */
export function generateI18nDictModule(dict: Record<string, string>): string {
    return `export default ${JSON.stringify(dict, null, 4)}\n`
}
