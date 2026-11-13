import { TustenError } from '../../errors'
import { getLocale } from './locale'
import { registerRk, reportI18nUse } from './runtime'

/** Словарь: ключ (текст на исходном языке) → перевод. */
export type I18nDictionary = Record<string, string>

/**
 * Загрузчик словаря. Генерируется Vite-плагином как `() => import('i18n-dict:…')`,
 * поэтому результат — namespace модуля с `default`.
 */
export type I18nLoader = () => Promise<{ default: I18nDictionary }>

/** Функция перевода модуля с служебными методами загрузки. */
export interface RkFunction {
    /**
     * Переводит ключ. Цепочка поиска: `ctx@@key` → `key` → сам `key`.
     *
     * @param key текст на исходном языке.
     * @param ctx необязательный контекст, отделяет омонимы (`'Помощь'` в разных местах).
     * @returns перевод или исходный ключ.
     */
    (key: string, ctx?: string): string
    /**
     * Загружает словарь для locale (по умолчанию текущей). Повторные вызовы
     * дедуплицируются. Для locale без словаря — no-op.
     *
     * @param locale язык; по умолчанию `getLocale()`.
     * @returns промис, который резолвится, когда словарь доступен `rk`.
     * @throws если загрузчик упал (сеть) или модуль словаря без `default`.
     */
    load(locale?: string): Promise<void>
    /**
     * Синхронно кладёт готовый словарь в кэш. Нужен SSR-гидрации: словарь,
     * встроенный в HTML, должен быть доступен до `hydrateRoot`, без `await`.
     *
     * @param locale язык словаря.
     * @param dict словарь.
     */
    seed(locale: string, dict: I18nDictionary): void
    /**
     * Копия загруженного словаря для locale. Нужна SSR, чтобы встроить словарь в HTML.
     *
     * @internal
     * @param locale язык.
     * @returns копия словаря или `undefined`, если он не загружен.
     */
    dictionary(locale: string): I18nDictionary | undefined
}

/**
 * Создаёт функцию перевода для одного клиентского модуля `i18n!<Module>`.
 *
 * Словарь подгружается лениво через `load` или синхронно через `seed`;
 * если словаря нет — `rk` возвращает ключ, без ошибок и предупреждений.
 *
 * @param moduleId имя модуля (для сообщений об ошибках).
 * @param loaders загрузчики по locale; отсутствующие locale не переводятся.
 * @returns функция `rk` с методами `load` и `seed`.
 */
export function createRk(moduleId: string, loaders: Record<string, I18nLoader>): RkFunction {
    // Map, а не объект: иначе `rk('constructor')` нашёл бы свойство из прототипа.
    const dicts = new Map<string, Map<string, string>>()
    const pending = new Map<string, Promise<void>>()

    const seed = (locale: string, dict: I18nDictionary): void => {
        dicts.set(locale, new Map(Object.entries(dict)))
    }

    const load = (locale: string | undefined = getLocale()): Promise<void> => {
        if (!locale || dicts.has(locale)) return Promise.resolve()
        if (!Object.prototype.hasOwnProperty.call(loaders, locale)) return Promise.resolve()

        const inFlight = pending.get(locale)
        if (inFlight) return inFlight

        const loader = loaders[locale]
        const promise = loader()
            .then((mod) => {
                if (!mod || typeof mod.default !== 'object' || mod.default === null) {
                    throw new TustenError(`i18n dictionary for "${moduleId}" (${locale}) has no default export`)
                }
                seed(locale, mod.default)
            })
            // Успех и ошибку снимаем с pending: после ошибки следующий load повторит попытку.
            .finally(() => pending.delete(locale))
        pending.set(locale, promise)
        return promise
    }

    const dictionary = (locale: string): I18nDictionary | undefined => {
        const dict = dicts.get(locale)
        return dict ? Object.fromEntries(dict) : undefined
    }

    const rk = (key: string, ctx?: string): string => {
        const locale = getLocale()
        if (!locale) return key
        // Учёт до проверки словаря: факт использования модуля важен независимо от
        // того, есть ли перевод для конкретного ключа.
        reportI18nUse(moduleId)
        const dict = dicts.get(locale)
        if (!dict) return key

        if (ctx !== undefined) {
            const withCtx = dict.get(`${ctx}@@${key}`)
            if (withCtx) return withCtx
        }
        // Пустой перевод считаем отсутствующим: иначе на экране окажется пустота.
        return dict.get(key) || key
    }

    const instance = Object.assign(rk, { load, seed, dictionary })
    registerRk(moduleId, instance)
    return instance
}
