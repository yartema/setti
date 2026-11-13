import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Контекст i18n одного SSR-запроса.
 *
 * Locale живёт в ALS, а не в модульной переменной: два параллельных запроса
 * с разными locale не должны видеть язык друг друга.
 */
export interface I18nRequestContext {
    /** Locale запроса (уже согласованная с `i18n.locales`). */
    locale: string
    /** Модули (`createRk`), у которых `rk` был вызван во время рендера этого запроса. */
    used: Set<string>
}

const als = new AsyncLocalStorage<I18nRequestContext>()

/**
 * Запускает функцию в контексте i18n-запроса.
 *
 * @param ctx контекст запроса.
 * @param fn функция (обработка запроса и рендер).
 * @returns результат `fn`.
 */
export function runWithI18nContext<T>(ctx: I18nRequestContext, fn: () => T): T {
    return als.run(ctx, fn)
}

/**
 * Резолвер locale для `tusten/client` на сервере.
 *
 * Вне запроса возвращает `undefined` — `rk` тогда отдаёт ключи.
 *
 * @returns locale текущего запроса или `undefined`.
 */
export function currentRequestLocale(): string | undefined {
    return als.getStore()?.locale
}

/**
 * Хук учёта использования `rk` для `tusten/client` на сервере.
 *
 * Вне запроса ничего не делает: `rk`, вызванный при старте процесса, не относится
 * ни к одной странице.
 *
 * @param moduleId имя `createRk`-модуля.
 */
export function recordRequestI18nUse(moduleId: string): void {
    als.getStore()?.used.add(moduleId)
}
