import type { I18nDictionary } from '../../client/i18n/create-rk'

/**
 * Сериализует значение как JS-литерал для inline `<script>`.
 *
 * JSON отдаёт `<`, `>`, `&` как есть. Строка перевода с `</script>` закрыла бы
 * тег раньше времени, поэтому экранируем их и разделители строк U+2028/U+2029
 * (до ES2019 они ломали литерал). Результат остаётся валидным JSON и JS.
 *
 * @param value сериализуемое значение (JSON-safe).
 * @returns безопасная для вставки в `<script>` строка.
 */
export function serializeForScript(value: unknown): string {
    // Escape-последовательности, а не сами символы: сырой U+2028 внутри регэкспа — синтаксическая ошибка.
    return JSON.stringify(value).replace(
        /[<>&\u2028\u2029]/g,
        (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
    )
}

/**
 * Строит `<script>` с locale страницы и словарями, которые нужны гидрации.
 *
 * Не ставим данные в `__ROOT_STATE_STR__`: тот разбирается только на SSR-ветке
 * клиента, а 404 и SPA-страницы тоже нуждаются в locale.
 *
 * @param locale locale страницы.
 * @param dicts словари использованных модулей: `moduleId → словарь`.
 * @returns HTML `<script>`.
 */
export function buildI18nBootScript(locale: string, dicts: Record<string, I18nDictionary>): string {
    return `<script>window.__ROOT_I18N__=${serializeForScript({ locale, dicts })}</script>`
}
