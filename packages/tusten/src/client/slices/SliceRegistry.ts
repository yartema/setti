import { TustenError } from '../../errors'
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
     * @throws {TustenError} если слайса нет.
     */
    require(key: string): AbstractSlice<unknown> {
        const slice = this.get(key)
        if (!slice) {
            throw new TustenError(`Slice "${key}" not found in registry`)
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
     * Если ключ уже занят другим инстансом — старый уничтожается, иначе его
     * подписки/таймеры остались бы жить после замены.
     *
     * @param key имя слайса.
     * @param slice экземпляр.
     */
    setPage(key: string, slice: AbstractSlice<unknown>): void {
        const prev = this.page.get(key)
        if (prev && prev !== slice) prev.destroy()
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
        const prev = this.global.get(key)
        if (prev && prev !== slice) prev.destroy()
        this.global.set(key, slice)
        this.notifyKey(key)
    }

    /**
     * Уничтожает все page-слайсы и очищает карту.
     *
     * Штатная SPA-навигация использует `adoptPage()` (атомарная подмена);
     * этот метод — для ошибок prefetch, `disposeAll()` и тестов.
     */
    disposePage(): void {
        const keys = [...this.page.keys()]
        for (const key of keys) {
            this.page.get(key)?.destroy()
        }
        this.page.clear()
        for (const key of keys) this.notifyKey(key)
    }

    /**
     * Атомарно заменяет page-слайсы слайсами другого реестра (SPA-навигация).
     *
     * Нужен, чтобы не убивать старую страницу до успешного префетча новой:
     * новая страница прогревается в отдельном реестре, и только после успеха
     * её слайсы переезжают сюда, а старые уничтожаются.
     *
     * Подписчиков **не** нотифицируем: сразу после вызова client-entry делает
     * `rootRef.render` с новым деревом, и все компоненты читают новый реестр.
     * Нотификация здесь заставила бы React перерисовать ещё смонтированную
     * старую страницу — ровно в момент, когда её слайсы уже уничтожены.
     *
     * @param source реестр с прогретыми page-слайсами новой страницы
     * (после вызова остаётся пустым — инстансы переезжают).
     */
    adoptPage(source: SliceRegistry): void {
        if (source === this) return

        const oldKeys = [...this.page.keys()]
        for (const key of oldKeys) this.page.get(key)?.destroy()
        this.page.clear()

        for (const [key, slice] of source.page) this.page.set(key, slice)
        source.page.clear()
    }

    /** Уничтожает все слайсы (конец запроса / размонтирование). */
    disposeAll(): void {
        this.disposePage()
        const globalKeys = [...this.global.keys()]
        for (const key of globalKeys) {
            this.global.get(key)?.destroy()
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
