/**
 * Базовый реактивный store слайса.
 *
 * TState — тип состояния слайса.
 *
 * Жизненный цикл:
 *   1. Создаётся (например, Loader'ом) — `_state === undefined`.
 *   2. `hydrate(result)` — единожды, `_state = _initState(result)`.
 *   3. Подписчики через `subscribe`, чтение через `getState`.
 *   4. `setState` — патч (мерж для объектов) + notify.
 *   5. `reset` — возврат к `_initialState`.
 *   6. `destroy()` — очистка подписчиков и состояния (при навигации).
 */

/** Слушатель изменений. */
export type SliceListener = () => void

/**
 * Патч состояния.
 *
 * Для объектов — `Partial<TState>`: переданные ключи заменяются, остальные
 * сохраняются. Для примитивов/массивов/`Map`/`Date` и экземпляров классов —
 * полное значение (мержить их бессмысленно, а массив превратился бы в объект).
 */
export type SlicePatch<TState> = TState extends object ? Partial<TState> : TState

/** Функциональный апдейтер — как в React setState. */
export type SliceUpdater<TState> = (prev: TState) => SlicePatch<TState>

/**
 * Проверяет, что значение — «плоский» объект (литерал).
 *
 * @param value проверяемое значение.
 * @returns `true` для `{}` и `Object.create(null)`.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

/**
 * Поверхностно мержит `patch` в `prev`.
 *
 * Мерж — только для plain-объектов: `{ ...prev, ...patch }`, вложенные
 * значения переиспользуются по ссылке. Для остальных типов (примитивы,
 * массивы, `Map`/`Set`/`Date`, экземпляры классов) `patch` заменяет значение.
 *
 * @param prev текущее состояние (`undefined` до первого hydrate/setState).
 * @param patch патч или новое значение.
 * @returns новое состояние (или `prev`, если патч ничего не изменил).
 */
function mergeState<TState>(prev: TState | undefined, patch: TState): TState {
    if (prev === undefined || !isPlainObject(prev) || !isPlainObject(patch)) return patch

    let changed = false
    const merged: Record<string, unknown> = { ...prev }
    for (const [key, value] of Object.entries(patch)) {
        if (!Object.is(merged[key], value)) changed = true
        merged[key] = value
    }

    // Ничего не поменялось — отдаём тот же объект, чтобы `Object.is` отсеял notify.
    return changed ? (merged as unknown as TState) : prev
}

export abstract class AbstractSlice<TState> {
    /** Текущее состояние. `undefined` до первого hydrate/setState. */
    protected _state: TState | undefined = undefined

    /** База для reset(): первое значение hydrate/setState. */
    protected _initialState: TState | undefined = undefined

    /** Флаг: hydrate уже вызывался. */
    protected _hydrated: boolean = false

    /** Флаг: слайс уничтожен (`setState`/`subscribe` больше не работают). */
    protected _destroyed: boolean = false

    /** Подписчики. */
    protected listeners: Set<SliceListener> = new Set()

    /**
     * Преобразование результата `loadData` в state.
     *
     * Абстрактный — наследник решает, что достать из result. В `Slice` —
     * identity. Прикладной слайс может обогатить state (computed, методы).
     *
     * `config` — `dataFactoryArguments` фабрики (статические аргументы из
     * `getConfig`). Он сериализуется в `__ROOT_STATE_STR__`, поэтому
     * `_initState` получает одно и то же и на сервере, и при гидратации
     * на клиенте.
     *
     * @param result результат `loadData`.
     * @param config аргументы фабрики (`dataFactoryArguments`).
     * @returns состояние слайса.
     */
    protected abstract _initState(result: unknown, config?: unknown): TState

    /**
     * Инициализация state результатом `loadData`.
     *
     * Вызывается Loader'ом один раз на экземпляр. Повторный вызов — ошибка.
     *
     * @param result результат `loadData`.
     * @param config аргументы фабрики (`dataFactoryArguments`).
     * @throws {Error} если hydrate уже вызывался.
     */
    hydrate(result: unknown, config?: unknown): void {
        if (this._hydrated) {
            throw new Error('Slice: hydrate уже вызывался. Используй setState.')
        }
        this._hydrated = true
        this._state = this._initState(result, config)
        if (this._initialState === undefined) {
            this._initialState = this._state
        }
        this.notify()
    }

    /**
     * Текущее состояние.
     *
     * @returns состояние слайса.
     */
    getState(): TState {
        return this._state as TState
    }

    /**
     * Snapshot для SSR/гидратации (=== getState).
     *
     * @returns состояние слайса.
     */
    getServerSnapshot(): TState {
        return this._state as TState
    }

    /**
     * Обновляет state и уведомляет подписчиков.
     *
     * Для plain-объектов — **поверхностный мерж**: в состоянии заменяются
     * только переданные ключи, остальные (и новые) сохраняются. Для
     * примитивов, массивов, `Map`/`Date` и экземпляров классов — замена.
     *
     * Если итоговое значение `Object.is` равно предыдущему — нотификации нет.
     *
     * @param next патч, полное значение или функция-апдейтер.
     */
    setState(next: SlicePatch<TState> | SliceUpdater<TState>): void {
        // Слайс уничтожен (`disposePage`): запись в него = утечка и «тихий»
        // ре-рендер уже размонтированного дерева.
        if (this._destroyed) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[tusten] setState on destroyed slice: ignored')
            }
            return
        }

        const prev = this._state
        const patch = typeof next === 'function' ? (next as SliceUpdater<TState>)(prev as TState) : next
        const value = mergeState(prev, patch as TState)

        if (Object.is(value, prev)) return

        this._state = value
        if (this._initialState === undefined) {
            this._initialState = value
        }
        this.notify()
    }

    /**
     * Подписка на изменения.
     *
     * @param listener колбэк.
     * @returns функция отписки (no-op для уничтоженного слайса).
     */
    subscribe(listener: SliceListener): () => void {
        // Подписка на уничтоженный слайс никогда не сработает и только
        // удержит замыкание — отдаём пустую отписку.
        if (this._destroyed) return () => {}

        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    /** Сброс к состоянию первого hydrate/setState. */
    reset(): void {
        if (this._state === this._initialState) return
        this._state = this._initialState
        this.notify()
    }

    /**
     * Уничтожает слайс: снимает подписчиков и очищает состояние.
     *
     * Наследник может переопределить метод, чтобы освободить свои ресурсы
     * (таймеры, внешние подписки, `AbortController`), но **обязан** вызвать
     * `super.destroy()` — иначе останутся слушатели и state.
     *
     * После `destroy()`: `setState` — no-op (+ `console.warn` вне production),
     * `subscribe` возвращает пустую отписку.
     */
    destroy(): void {
        if (this._destroyed) return
        this._destroyed = true
        this.listeners.clear()
        this._state = undefined
        this._initialState = undefined
    }

    /**
     * Уничтожен ли слайс.
     *
     * @returns `true` после `destroy()`.
     */
    isDestroyed(): boolean {
        return this._destroyed
    }

    /**
     * @deprecated Используйте `destroy()` — `dispose()` оставлен как алиас
     * (теперь он тоже очищает state).
     */
    dispose(): void {
        this.destroy()
    }

    /** Оповещает подписчиков. */
    protected notify(): void {
        for (const l of this.listeners) l()
    }
}
