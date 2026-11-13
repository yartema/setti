import type { TustenI18nConfig } from '../../types'
import { LOCALE_COOKIE } from '../../shared/locale'

/**
 * Определяет locale HTTP-запроса: cookie → `Accept-Language` → `defaultLocale`.
 *
 * Cookie важнее заголовка: это явный выбор пользователя (`setLocale`), а
 * `Accept-Language` — лишь подсказка браузера.
 *
 * @param input значения заголовков.
 * @param input.cookie заголовок `Cookie`.
 * @param input.acceptLanguage заголовок `Accept-Language`.
 * @param i18n нормализованный конфиг i18n (`locales` уже валидированы).
 * @returns одна из `i18n.locales`; всегда возвращает значение, никогда не бросает.
 */
export function resolveRequestLocale(
    input: { cookie?: string; acceptLanguage?: string },
    i18n: TustenI18nConfig,
): string {
    return (
        readLocaleCookie(input.cookie, i18n.locales) ??
        negotiateAcceptLanguage(input.acceptLanguage, i18n.locales) ??
        i18n.defaultLocale
    )
}

/**
 * Читает locale из cookie. Значение вне `locales` игнорируем: иначе клиент
 * мог бы подсунуть произвольный locale в путь словаря или в HTML.
 *
 * @param cookieHeader заголовок `Cookie`.
 * @param locales допустимые locale.
 * @returns locale из cookie или `undefined`.
 */
function readLocaleCookie(cookieHeader: string | undefined, locales: readonly string[]): string | undefined {
    if (!cookieHeader) return undefined
    for (const pair of cookieHeader.split(';')) {
        const idx = pair.indexOf('=')
        if (idx === -1) continue
        if (pair.slice(0, idx).trim() !== LOCALE_COOKIE) continue

        // Битый percent-encoding не должен ронять запрос: это данные клиента.
        let value: string
        try {
            value = decodeURIComponent(pair.slice(idx + 1).trim())
        } catch {
            return undefined
        }
        return locales.includes(value) ? value : undefined
    }
    return undefined
}

/**
 * Подбирает locale по `Accept-Language` с учётом `q`.
 *
 * Сначала ищем точное совпадение по всем языкам заголовка, и только потом
 * совпадение по основному подтегу (`en-GB` → `en`). Так `pt-PT` в заголовке
 * не уступит `pt-BR` из конфига, если в конфиге есть точное `pt-PT`.
 *
 * @param header значение `Accept-Language`.
 * @param locales допустимые locale.
 * @returns подходящая locale или `undefined`.
 */
export function negotiateAcceptLanguage(header: string | undefined, locales: readonly string[]): string | undefined {
    if (!header) return undefined

    const candidates = header
        .split(',')
        .map((part) => {
            const [tag = '', ...params] = part.trim().split(';')
            let q = 1
            for (const param of params) {
                const match = /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(param)
                if (match) q = Number(match[1])
            }
            return { tag: tag.trim().toLowerCase(), q }
        })
        // `q=0` означает «не хочу»; `*` — не язык. Sort стабилен, поэтому при равном q
        // сохраняется порядок заголовка.
        .filter((c) => c.tag && c.tag !== '*' && c.q > 0 && !Number.isNaN(c.q))
        .sort((a, b) => b.q - a.q)

    for (const { tag } of candidates) {
        const exact = locales.find((locale) => locale.toLowerCase() === tag)
        if (exact) return exact
    }
    for (const { tag } of candidates) {
        const primary = tag.split('-')[0]
        const byPrimary = locales.find((locale) => locale.toLowerCase().split('-')[0] === primary)
        if (byPrimary) return byPrimary
    }
    return undefined
}
