import { SettiError } from '../../errors'
import type { AbstractSlice } from './AbstractSlice'

/**
 * Реестр слайсов.
 *
 * Две карты:
 *   - `page` — фабрики текущей страницы (dispose на навигации);
 *   - `global` — глобальные loaders (`defineGlobalLoader`), живут до
 *     перезагрузки клиента / конца серверного запроса.
 *
 * `get(key)` ищет сначала в `page`, потом в `global`.
 */
export class SliceRegistry {
    /** Page-scoped слайсы. */
    private page = new Map<string, AbstractSlice<unknown>>()

    /** Global-scoped слайсы. */
    private global = new Map<string, AbstractSlice<unknown>>()

    /** Подписчики на изменение конкретного ключа (для useSyncExternalStore). */
    private keyListeners = new Map<string, Set<() => void>>()

    /**
     * Ищет слайс по ключу: сначала page, потом global.
     *
     * @param key имя слайса.
     * @returns слайс или undefined.
     */
    get(key: string): AbstractSlice<unknown> | undefined {
        return this.page.get(key) ?? this.global.get(key)
    }

    /**
     * Строгий поиск слайса.
     *
     * @param key имя слайса.
     * @returns слайс.
     * @throws {SettiError} если слайса нет.
     */
    require(key: string): AbstractSlice<unknown> {
        const slice = this.get(key)
        if (!slice) {
            throw new SettiError(`Slice "${key}" not found in registry`)
        }
        return slice
    }

    /**
     * Подписка на изменение присутствия/инстанса слайса по ключу.
     *
     * @param key имя слайса.
     * @param cb колбэк.
     * @returns функция отписки.
     */
    subscribeKey(key: string, cb: () => void): () => void {
        let set = this.keyListeners.get(key)
        if (!set) {
            set = new Set()
            this.keyListeners.set(key, set)
        }
        set.add(cb)
        return () => {
            const s = this.keyListeners.get(key)
            if (!s) return
            s.delete(cb)
            if (s.size === 0) this.keyListeners.delete(key)
        }
    }

    /**
     * Регистрирует page-scoped слайс.
     *
     * @param key имя слайса.
     * @param slice экземпляр.
     */
    setPage(key: string, slice: AbstractSlice<unknown>): void {
        this.page.set(key, slice)
        this.notifyKey(key)
    }

    /**
     * Регистрирует global-scoped слайс.
     *
     * @param key имя слайса.
     * @param slice экземпляр.
     */
    setGlobal(key: string, slice: AbstractSlice<unknown>): void {
        this.global.set(key, slice)
        this.notifyKey(key)
    }

    /** Dispose всех page-слайсов и очистка карты (навигация). */
    disposePage(): void {
        const keys = [...this.page.keys()]
        for (const key of keys) {
            this.page.get(key)?.dispose()
        }
        this.page.clear()
        for (const key of keys) this.notifyKey(key)
    }

    /** Dispose всех слайсов (конец запроса / размонтирование). */
    disposeAll(): void {
        this.disposePage()
        const globalKeys = [...this.global.keys()]
        for (const key of globalKeys) {
            this.global.get(key)?.dispose()
        }
        this.global.clear()
        for (const key of globalKeys) this.notifyKey(key)
    }

    /**
     * Уведомляет подписчиков на конкретный ключ.
     *
     * @param key имя слайса.
     */
    private notifyKey(key: string): void {
        const set = this.keyListeners.get(key)
        if (set) for (const cb of set) cb()
    }
}
