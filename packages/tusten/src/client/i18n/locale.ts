import { TustenError } from '../../errors'
import { LOCALE_COOKIE, isValidLocale } from '../../shared/locale'

/**
 * Функция, возвращающая текущий locale. `undefined` — locale не известна,
 * тогда `rk` возвращает исходные ключи.
 */
export type LocaleResolver = () => string | undefined

/**
 * Резолвер по умолчанию — намеренно пустой.
 *
 * Клиентская locale обязана совпадать с той, которую SSR использовал для
 * рендера, иначе будет hydration mismatch. Её должен задать вызывающий код
 * (в Фазе 3 — из состояния корня, которое пришло с сервера), а не cookie в браузере.
 *
 * @returns всегда `undefined`.
 */
function noLocale(): undefined {
    return undefined
}

let resolver: LocaleResolver = noLocale

/** Срок жизни cookie с выбранным языком: 1 год. */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Задаёт источник текущей locale. На сервере — резолвер на `AsyncLocalStorage`,
 * на клиенте — константа из состояния корня.
 *
 * @param fn функция, возвращающая locale.
 */
export function setLocaleResolver(fn: LocaleResolver): void {
    resolver = fn
}

/**
 * Возвращает текущую locale.
 *
 * @returns locale или `undefined`, если резолвер её не знает.
 */
export function getLocale(): string | undefined {
    return resolver()
}

/**
 * Сохраняет выбранный язык в cookie и перезагружает страницу.
 *
 * Реактивного переключения нет: словари и SSR-рендер зависят от locale на
 * старте страницы, поэтому проще и надёжнее перезагрузить её целиком.
 *
 * @param locale новый язык.
 * @throws {TustenError} если locale некорректна или вызов сделан не в браузере.
 */
export function setLocale(locale: string): void {
    if (!isValidLocale(locale)) {
        throw new TustenError(`Invalid locale "${String(locale)}"`)
    }
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        throw new TustenError('setLocale() can only be called in the browser')
    }
    // Проверку «locale есть в конфиге» здесь не делаем: клиент её не знает.
    // Сервер при чтении cookie обязан отбросить неизвестное значение.
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
    window.location.reload()
}
