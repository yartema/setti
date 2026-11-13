/**
 * Общие константы и проверки locale для клиента и сервера.
 *
 * Модуль client-safe: без `node:*`, чтобы его можно было импортировать и в браузере,
 * и в конфиге, и в SSR.
 */

/** Имя cookie с выбранным пользователем языком. Читает сервер (SSR), пишет `setLocale`. */
export const LOCALE_COOKIE = 'tusten_locale'

/**
 * Допустимый формат locale (`en`, `pt-BR`). Только буквы, цифры и дефисы:
 * locale попадает в путь `lang/<locale>/` и в virtual-id модуля, поэтому
 * разделители пути и `..` недопустимы.
 */
const LOCALE_PATTERN = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/

/**
 * Проверяет, что значение — строка допустимого формата locale.
 *
 * @param value проверяемое значение.
 * @returns `true`, если это допустимый locale.
 */
export function isValidLocale(value: unknown): value is string {
    return typeof value === 'string' && LOCALE_PATTERN.test(value)
}
