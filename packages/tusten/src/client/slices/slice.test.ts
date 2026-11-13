import { describe, expect, it, vi } from 'vitest'
import { AbstractSlice } from './AbstractSlice'
import { Slice } from './Slice'

/** Конкретный слайс с identity `_initState` (для тестов). */
class NumberSlice extends Slice<number> {}

/** Слайс с кастомным `_initState` (обогащение). */
class EnrichedSlice extends AbstractSlice<{ value: number; doubled: number }> {
    protected override _initState(result: unknown): {
        value: number
        doubled: number
    } {
        const value = result as number
        return { value, doubled: value * 2 }
    }
}

/** Слайс, который использует `config` из `_initState`. */
class ConfigAwareSlice extends AbstractSlice<{ value: number; source: string }> {
    protected override _initState(result: unknown, config?: unknown): { value: number; source: string } {
        const cfg = (config ?? {}) as { source?: string }
        return { value: result as number, source: cfg.source ?? 'default' }
    }
}

describe('Slice (AbstractSlice identity)', () => {
    it('initial state — undefined', () => {
        const s = new NumberSlice()
        expect(s.getState()).toBeUndefined()
    })

    it('hydrate устанавливает state', () => {
        const s = new NumberSlice()
        s.hydrate(42)
        expect(s.getState()).toBe(42)
        expect(s.getServerSnapshot()).toBe(42)
    })

    it('повторный hydrate — ошибка', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        expect(() => s.hydrate(2)).toThrow(/hydrate.*уже вызывался/)
    })

    it('setState обновляет state', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        s.setState(5)
        expect(s.getState()).toBe(5)
    })

    it('setState с функцией-апдейтером', () => {
        const s = new NumberSlice()
        s.hydrate(10)
        s.setState((prev) => prev + 1)
        expect(s.getState()).toBe(11)
    })

    it('setState одинаковое значение (Object.is) — без нотификации', () => {
        const s = new NumberSlice()
        s.hydrate(5)
        const listener = vi.fn()
        s.subscribe(listener)
        s.setState(5)
        expect(listener).not.toHaveBeenCalled()
    })

    it('subscribe вызывает listener при setState', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        const listener = vi.fn()
        s.subscribe(listener)
        s.setState(2)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('unsubscribe останавливает нотификацию', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        const listener = vi.fn()
        const unsub = s.subscribe(listener)
        s.setState(2)
        expect(listener).toHaveBeenCalledTimes(1)
        unsub()
        s.setState(3)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('несколько подписчиков — все вызываются', () => {
        const s = new NumberSlice()
        s.hydrate(0)
        const a = vi.fn()
        const b = vi.fn()
        s.subscribe(a)
        s.subscribe(b)
        s.setState(1)
        expect(a).toHaveBeenCalledTimes(1)
        expect(b).toHaveBeenCalledTimes(1)
    })

    it('reset возвращает к initialState (после hydrate)', () => {
        const s = new NumberSlice()
        s.hydrate(10)
        s.setState(20)
        s.reset()
        expect(s.getState()).toBe(10)
    })

    it('reset без hydrate — no-op', () => {
        const s = new NumberSlice()
        expect(() => s.reset()).not.toThrow()
    })

    it('reset уведомляет подписчиков', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        s.setState(2)
        const listener = vi.fn()
        s.subscribe(listener)
        s.reset()
        expect(listener).toHaveBeenCalledTimes(1)
        expect(s.getState()).toBe(1)
    })

    it('reset, если state === initial — без нотификации', () => {
        const s = new NumberSlice()
        s.hydrate(5)
        const listener = vi.fn()
        s.subscribe(listener)
        s.reset()
        expect(listener).not.toHaveBeenCalled()
    })

    it('setState до hydrate — initial = первое значение', () => {
        const s = new NumberSlice()
        s.setState(7)
        s.setState(9)
        s.reset()
        expect(s.getState()).toBe(7)
    })

    it('destroy очищает подписчиков', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        const listener = vi.fn()
        s.subscribe(listener)
        s.destroy()
        s.setState(2)
        expect(listener).not.toHaveBeenCalled()
    })

    it('destroy очищает state и помечает слайс уничтоженным', () => {
        const s = new NumberSlice()
        s.hydrate(42)
        expect(s.isDestroyed()).toBe(false)
        s.destroy()
        expect(s.isDestroyed()).toBe(true)
        expect(s.getState()).toBeUndefined()
    })

    it('setState после destroy — no-op (без warn в production)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const s = new NumberSlice()
        s.hydrate(1)
        s.destroy()
        s.setState(2)
        expect(s.getState()).toBeUndefined()
        expect(warn).toHaveBeenCalledTimes(1)
        warn.mockRestore()
    })

    it('destroy идемпотентен', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        s.destroy()
        expect(() => s.destroy()).not.toThrow()
        expect(s.isDestroyed()).toBe(true)
    })

    it('subscribe после destroy возвращает пустую отписку', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        s.destroy()
        const unsub = s.subscribe(() => {})
        expect(typeof unsub).toBe('function')
        expect(() => unsub()).not.toThrow()
    })

    it('dispose — deprecated алиас destroy', () => {
        const s = new NumberSlice()
        s.hydrate(42)
        s.dispose()
        expect(s.isDestroyed()).toBe(true)
        expect(s.getState()).toBeUndefined()
    })

    it('наследник может освободить ресурсы и вызвать super.destroy()', () => {
        const timer = { cleared: false }
        /** Слайс с «внешним ресурсом», который надо освободить. */
        class TimedSlice extends Slice<number> {
            override destroy(): void {
                timer.cleared = true
                super.destroy()
            }
        }

        const s = new TimedSlice()
        s.hydrate(1)
        s.destroy()
        expect(timer.cleared).toBe(true)
        expect(s.isDestroyed()).toBe(true)
        expect(s.getState()).toBeUndefined()
    })
})

describe('AbstractSlice с кастомным _initState', () => {
    it('hydrate трансформирует result', () => {
        const s = new EnrichedSlice()
        s.hydrate(5)
        expect(s.getState()).toEqual({ value: 5, doubled: 10 })
    })

    it('reset возвращает к трансформированному initial', () => {
        const s = new EnrichedSlice()
        s.hydrate(3)
        s.setState({ value: 10, doubled: 20 })
        s.reset()
        expect(s.getState()).toEqual({ value: 3, doubled: 6 })
    })

    it('setState функцией на объекте', () => {
        const s = new EnrichedSlice()
        s.hydrate(1)
        s.setState((prev) => ({ ...prev, doubled: 999 }))
        expect(s.getState()).toEqual({ value: 1, doubled: 999 })
    })
})

describe('AbstractSlice: _initState(result, config)', () => {
    it('config приходит вторым аргументом', () => {
        const s = new ConfigAwareSlice()
        s.hydrate(7, { source: 'api' })
        expect(s.getState()).toEqual({ value: 7, source: 'api' })
    })

    it('без config — undefined (старые вызовы hydrate совместимы)', () => {
        const s = new ConfigAwareSlice()
        s.hydrate(7)
        expect(s.getState()).toEqual({ value: 7, source: 'default' })
    })
})

/** Слайс с произвольными ключами — для проверки мержа. */
class BagSlice extends Slice<Record<string, unknown>> {}

describe('AbstractSlice: setState мержит plain-объекты', () => {
    it('патч сохраняет остальные ключи', () => {
        const s = new BagSlice()
        s.hydrate({ a: 1, b: 2 })
        s.setState({ b: 3 })
        expect(s.getState()).toEqual({ a: 1, b: 3 })
    })

    it('патч добавляет новый ключ', () => {
        const s = new BagSlice()
        s.hydrate({ a: 1 })
        s.setState({ c: 3 })
        expect(s.getState()).toEqual({ a: 1, c: 3 })
    })

    it('функция-апдейтер тоже мержится', () => {
        const s = new BagSlice()
        s.hydrate({ a: 1, b: 2 })
        s.setState((prev) => ({ b: (prev.b as number) + 1 }))
        expect(s.getState()).toEqual({ a: 1, b: 3 })
    })

    it('патч без изменений — без нотификации и без новой ссылки', () => {
        const s = new BagSlice()
        s.hydrate({ a: 1, b: 2 })
        const before = s.getState()
        const listener = vi.fn()
        s.subscribe(listener)
        s.setState({ a: 1 })
        expect(listener).not.toHaveBeenCalled()
        expect(s.getState()).toBe(before)
    })

    it('reset после частичного патча возвращает initial', () => {
        const s = new BagSlice()
        s.hydrate({ a: 1, b: 2 })
        s.setState({ b: 3 })
        s.reset()
        expect(s.getState()).toEqual({ a: 1, b: 2 })
    })

    it('массив заменяется целиком, а не мержится', () => {
        const s = new Slice<number[]>()
        s.hydrate([1, 2, 3])
        s.setState([9])
        expect(s.getState()).toEqual([9])
    })

    it('Date заменяется, а не мержится', () => {
        const s = new Slice<Date>()
        s.hydrate(new Date('2024-01-01T00:00:00Z'))
        const next = new Date('2025-01-01T00:00:00Z')
        s.setState(next)
        expect(s.getState()).toBe(next)
    })
})
