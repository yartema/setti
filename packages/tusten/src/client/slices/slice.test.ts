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

    it('dispose очищает подписчиков', () => {
        const s = new NumberSlice()
        s.hydrate(1)
        const listener = vi.fn()
        s.subscribe(listener)
        s.dispose()
        s.setState(2)
        expect(listener).not.toHaveBeenCalled()
    })

    it('dispose не трогает state', () => {
        const s = new NumberSlice()
        s.hydrate(42)
        s.dispose()
        expect(s.getState()).toBe(42)
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
