/**
 * Базовый реактивный store слайса.
 *
 * TState — тип состояния слайса.
 *
 * Жизненный цикл:
 *   1. Создаётся (например, Loader'ом) — `_state === undefined`.
 *   2. `hydrate(result)` — единожды, `_state = _initState(result)`.
 *   3. Подписчики через `subscribe`, чтение через `getState`.
 *   4. `setState` — обновление + notify.
 *   5. `reset` — возврат к `_initialState`.
 *   6. `dispose` — очистка подписчиков (при навигации).
 */

/** Слушатель изменений. */
export type SliceListener = () => void

/** Функциональный апдейтер — как в React setState. */
export type SliceUpdater<TState> = (prev: TState) => TState

export abstract class AbstractSlice<TState> {
  /** Текущее состояние. `undefined` до первого hydrate/setState. */
  protected _state: TState | undefined = undefined

  /** База для reset(): первое значение hydrate/setState. */
  protected _initialState: TState | undefined = undefined

  /** Флаг: hydrate уже вызывался. */
  protected _hydrated: boolean = false

  /** Подписчики. */
  protected listeners: Set<SliceListener> = new Set()

  /**
   * Преобразование результата `loadData` в state.
   *
   * Абстрактный — наследник решает, что достать из result. В `Slice` —
   * identity. Прикладной слайс может обогатить state (computed, методы).
   *
   * @param result результат `loadData`.
   * @returns состояние слайса.
   */
  protected abstract _initState(result: unknown): TState

  /**
   * Инициализация state результатом `loadData`.
   *
   * Вызывается Loader'ом один раз на экземпляр. Повторный вызов — ошибка.
   *
   * @param result результат `loadData`.
   * @throws {Error} если hydrate уже вызывался.
   */
  hydrate(result: unknown): void {
    if (this._hydrated) {
      throw new Error('Slice: hydrate уже вызывался. Используй setState.')
    }
    this._hydrated = true
    this._state = this._initState(result)
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
   * Если `value === prev` (Object.is) — нотификации нет.
   *
   * @param next новое значение или функция-апдейтер.
   */
  setState(next: TState | SliceUpdater<TState>): void {
    const prev = this._state
    const value =
      typeof next === 'function'
        ? (next as SliceUpdater<TState>)(prev as TState)
        : next

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
   * @returns функция отписки.
   */
  subscribe(listener: SliceListener): () => void {
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

  /** Уничтожение: очистка подписчиков. */
  dispose(): void {
    this.listeners.clear()
  }

  /** Оповещает подписчиков. */
  protected notify(): void {
    for (const l of this.listeners) l()
  }
}