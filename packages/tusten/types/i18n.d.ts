/**
 * Типы импорта i18n-модулей: `import rk from 'i18n!HomePage'`.
 *
 * Файл — глобальный скрипт (без import/export), поэтому `declare module` с шаблоном применяется
 * ко всей программе. Подключается одним из способов:
 *   - автоматически: `@tusten/core/client` ссылается на этот файл (`/// <reference path>`);
 *   - явно: `/// <reference types="@tusten/core/i18n" />` в любом `.d.ts` проекта.
 *
 * Типы намеренно минимальны: рантайм-API (`load`, `seed`, `dictionary`) внутреннее.
 */

declare module 'i18n!*' {
    /**
     * Переводит ключ в locale текущей страницы. Нет словаря или ключа — вернёт `key`.
     *
     * @param key ключ (текст на исходном языке).
     * @param ctx необязательный контекст: сначала ищется `ctx@@key`, затем `key`.
     * @returns переведённая строка.
     */
    const rk: (key: string, ctx?: string) => string
    export default rk
}
