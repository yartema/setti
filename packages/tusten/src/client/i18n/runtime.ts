import { getLocale, setLocaleResolver } from './locale'
import type { I18nDictionary, RkFunction } from './create-rk'

/**
 * Данные, которые сервер встроил в HTML (`window.__ROOT_I18N__`).
 *
 * @internal
 */
export interface I18nBootstrap {
    /** Locale страницы. Константа на всё время жизни страницы. */
    locale: string
    /** Словари использованных при SSR модулей: `moduleId → словарь для locale`. */
    dicts?: Record<string, I18nDictionary>
}

/**
 * Состояние i18n-рантайма одного инстанса `tusten/client`.
 *
 * Модули `i18n!<Module>` создаются при импорте маршрута — позже, чем приходит
 * HTML. Поэтому словари из boot храним здесь и применяем в момент регистрации
 * модуля: так гидрация не зависит от порядка импортов.
 */
let boot: I18nBootstrap | null = null
/** Все созданные `createRk`-инстансы по имени модуля (последний побеждает, важно для HMR). */
const instances = new Map<string, RkFunction>()
/** Хук учёта использования `rk` — ставит SSR, чтобы знать, какие словари встраивать. */
let usageHook: ((moduleId: string) => void) | undefined

/**
 * Применяет данные из HTML: задаёт locale и заполняет словари уже созданных модулей.
 *
 * Вызывается клиентским entry до `hydrateRoot`. Модули, созданные позже, получат
 * свой словарь в {@link registerRk}.
 *
 * @internal
 * @param bootstrap locale и словари из `window.__ROOT_I18N__`.
 */
export function initI18n(bootstrap: I18nBootstrap): void {
    const locale = bootstrap.locale
    boot = { locale, dicts: bootstrap.dicts ?? {} }
    setLocaleResolver(() => locale)
    for (const [moduleId, rk] of instances) seedFromBoot(moduleId, rk)
}

/**
 * Кладёт словарь из boot в инстанс, если сервер его встроил.
 *
 * @param moduleId имя модуля.
 * @param rk инстанс.
 */
function seedFromBoot(moduleId: string, rk: RkFunction): void {
    if (!boot) return
    // hasOwnProperty: имя модуля не должно находить свойства прототипа объекта.
    if (!Object.prototype.hasOwnProperty.call(boot.dicts, moduleId)) return
    rk.seed(boot.locale, boot.dicts![moduleId])
}

/**
 * Регистрирует созданный `createRk`-инстанс.
 *
 * @internal
 * @param moduleId имя модуля.
 * @param rk инстанс.
 */
export function registerRk(moduleId: string, rk: RkFunction): void {
    instances.set(moduleId, rk)
    seedFromBoot(moduleId, rk)
}

/**
 * Загружает словари всех зарегистрированных модулей для locale.
 *
 * Уже засеянные из HTML модули не делают сетевых запросов. Нужна перед
 * рендером маршрута: без неё `rk` вернёт ключи до прихода словаря.
 *
 * @internal
 * @param locale язык; по умолчанию `getLocale()`. Без locale — no-op.
 * @returns промис, который резолвится, когда все словари загружены.
 * @throws если загрузка словаря упала (сеть).
 */
export async function loadRegisteredDictionaries(locale: string | undefined = getLocale()): Promise<void> {
    if (!locale) return
    await Promise.all([...instances.values()].map((rk) => rk.load(locale)))
}

/**
 * Возвращает словарь модуля для locale, если он уже загружен.
 *
 * @internal
 * @param moduleId имя модуля.
 * @param locale язык.
 * @returns копия словаря или `undefined`.
 */
export function getRegisteredDictionary(moduleId: string, locale: string): I18nDictionary | undefined {
    return instances.get(moduleId)?.dictionary(locale)
}

/**
 * Задаёт хук, который получает имя модуля при каждом вызове `rk` с locale.
 *
 * На сервере хук пишет в per-request набор — по нему SSR решает, какие словари
 * встроить в HTML. На клиенте не ставится.
 *
 * @internal
 * @param hook обработчик или `undefined`, чтобы снять.
 */
export function setI18nUsageHook(hook: ((moduleId: string) => void) | undefined): void {
    usageHook = hook
}

/**
 * Сообщает хуку об использовании модуля. Вызывается из `rk`.
 *
 * @internal
 * @param moduleId имя модуля.
 */
export function reportI18nUse(moduleId: string): void {
    usageHook?.(moduleId)
}
