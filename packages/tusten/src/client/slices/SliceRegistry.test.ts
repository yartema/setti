import { describe, expect, it, vi } from 'vitest'
import { SliceRegistry } from './SliceRegistry'
import { Slice } from './Slice'
import { TustenError } from '../../errors'

/** Слайс для тестов. */
class TestSlice extends Slice<number> {}

describe('SliceRegistry', () => {
    describe('get / require', () => {
        it('get возвращает undefined на пустой реестр', () => {
            const r = new SliceRegistry()
            expect(r.get('x')).toBeUndefined()
        })

        it('require бросает на отсутствующий', () => {
            const r = new SliceRegistry()
            expect(() => r.require('x')).toThrow(TustenError)
            expect(() => r.require('x')).toThrow(/Slice "x" not found/)
        })

        it('get находит page-scoped слайс', () => {
            const r = new SliceRegistry()
            const s = new TestSlice()
            r.setPage('user', s)
            expect(r.get('user')).toBe(s)
        })

        it('get находит global-scoped слайс', () => {
            const r = new SliceRegistry()
            const s = new TestSlice()
            r.setGlobal('userInfo', s)
            expect(r.get('userInfo')).toBe(s)
        })

        it('page приоритетнее global при коллизии ключа', () => {
            const r = new SliceRegistry()
            const pageSlice = new TestSlice()
            const globalSlice = new TestSlice()
            r.setGlobal('x', globalSlice)
            r.setPage('x', pageSlice)
            expect(r.get('x')).toBe(pageSlice)
        })

        it('require возвращает слайс', () => {
            const r = new SliceRegistry()
            const s = new TestSlice()
            r.setPage('x', s)
            expect(r.require('x')).toBe(s)
        })
    })

    describe('disposePage', () => {
        it('destroy-ит все page-слайсы', () => {
            const r = new SliceRegistry()
            const a = new TestSlice()
            const b = new TestSlice()
            const spyA = vi.spyOn(a, 'destroy')
            const spyB = vi.spyOn(b, 'destroy')
            r.setPage('a', a)
            r.setPage('b', b)
            r.disposePage()
            expect(spyA).toHaveBeenCalledTimes(1)
            expect(spyB).toHaveBeenCalledTimes(1)
            expect(a.isDestroyed()).toBe(true)
            expect(b.isDestroyed()).toBe(true)
            expect(r.get('a')).toBeUndefined()
            expect(r.get('b')).toBeUndefined()
        })

        it('не трогает global', () => {
            const r = new SliceRegistry()
            const globalSlice = new TestSlice()
            const spy = vi.spyOn(globalSlice, 'destroy')
            r.setGlobal('userInfo', globalSlice)
            r.setPage('pageX', new TestSlice())
            r.disposePage()
            expect(spy).not.toHaveBeenCalled()
            expect(globalSlice.isDestroyed()).toBe(false)
            expect(r.get('userInfo')).toBe(globalSlice)
        })

        it('идемпотентен', () => {
            const r = new SliceRegistry()
            r.setPage('a', new TestSlice())
            r.disposePage()
            expect(() => r.disposePage()).not.toThrow()
        })
    })

    describe('disposeAll', () => {
        it('destroy-ит page и global', () => {
            const r = new SliceRegistry()
            const pageSlice = new TestSlice()
            const globalSlice = new TestSlice()
            const spyP = vi.spyOn(pageSlice, 'destroy')
            const spyG = vi.spyOn(globalSlice, 'destroy')
            r.setPage('p', pageSlice)
            r.setGlobal('g', globalSlice)
            r.disposeAll()
            expect(spyP).toHaveBeenCalledTimes(1)
            expect(spyG).toHaveBeenCalledTimes(1)
            expect(pageSlice.isDestroyed()).toBe(true)
            expect(globalSlice.isDestroyed()).toBe(true)
            expect(r.get('p')).toBeUndefined()
            expect(r.get('g')).toBeUndefined()
        })
    })

    describe('subscribeKey', () => {
        it('нотифицирует при setPage', () => {
            const r = new SliceRegistry()
            const cb = vi.fn()
            r.subscribeKey('x', cb)
            r.setPage('x', new TestSlice())
            expect(cb).toHaveBeenCalledTimes(1)
        })

        it('нотифицирует при setGlobal', () => {
            const r = new SliceRegistry()
            const cb = vi.fn()
            r.subscribeKey('x', cb)
            r.setGlobal('x', new TestSlice())
            expect(cb).toHaveBeenCalledTimes(1)
        })

        it('нотифицирует при disposePage', () => {
            const r = new SliceRegistry()
            r.setPage('x', new TestSlice())
            const cb = vi.fn()
            r.subscribeKey('x', cb)
            r.disposePage()
            expect(cb).toHaveBeenCalledTimes(1)
        })

        it('нотифицирует при disposeAll для global', () => {
            const r = new SliceRegistry()
            r.setGlobal('g', new TestSlice())
            const cb = vi.fn()
            r.subscribeKey('g', cb)
            r.disposeAll()
            expect(cb).toHaveBeenCalledTimes(1)
        })

        it('unsubscribe останавливает нотификации', () => {
            const r = new SliceRegistry()
            const cb = vi.fn()
            const unsub = r.subscribeKey('x', cb)
            unsub()
            r.setPage('x', new TestSlice())
            expect(cb).not.toHaveBeenCalled()
        })

        it('разные ключи — независимые подписчики', () => {
            const r = new SliceRegistry()
            const cbX = vi.fn()
            const cbY = vi.fn()
            r.subscribeKey('x', cbX)
            r.subscribeKey('y', cbY)
            r.setPage('x', new TestSlice())
            expect(cbX).toHaveBeenCalledTimes(1)
            expect(cbY).not.toHaveBeenCalled()
        })

        it('несколько подписчиков на один ключ', () => {
            const r = new SliceRegistry()
            const a = vi.fn()
            const b = vi.fn()
            r.subscribeKey('x', a)
            r.subscribeKey('x', b)
            r.setPage('x', new TestSlice())
            expect(a).toHaveBeenCalledTimes(1)
            expect(b).toHaveBeenCalledTimes(1)
        })
    })

    describe('перезапись', () => {
        it('setPage дважды — второй побеждает', () => {
            const r = new SliceRegistry()
            const a = new TestSlice()
            const b = new TestSlice()
            r.setPage('x', a)
            r.setPage('x', b)
            expect(r.get('x')).toBe(b)
        })

        it('setPage уничтожает заменяемый инстанс', () => {
            const r = new SliceRegistry()
            const a = new TestSlice()
            a.hydrate(1)
            r.setPage('x', a)
            r.setPage('x', new TestSlice())
            expect(a.isDestroyed()).toBe(true)
            expect(a.getState()).toBeUndefined()
        })

        it('setPage тем же инстансом — не уничтожает его', () => {
            const r = new SliceRegistry()
            const a = new TestSlice()
            a.hydrate(7)
            r.setPage('x', a)
            r.setPage('x', a)
            expect(a.isDestroyed()).toBe(false)
            expect(a.getState()).toBe(7)
        })

        it('setGlobal уничтожает заменяемый инстанс', () => {
            const r = new SliceRegistry()
            const a = new TestSlice()
            a.hydrate(1)
            r.setGlobal('g', a)
            r.setGlobal('g', new TestSlice())
            expect(a.isDestroyed()).toBe(true)
        })

        it('page перекрывает global через get', () => {
            const r = new SliceRegistry()
            const g = new TestSlice()
            const p = new TestSlice()
            r.setGlobal('x', g)
            r.setPage('x', p)
            expect(r.get('x')).toBe(p)
            r.disposePage()
            expect(r.get('x')).toBe(g)
        })
    })

    describe('adoptPage', () => {
        it('переносит page-слайсы и уничтожает старые', () => {
            const r = new SliceRegistry()
            const oldSlice = new TestSlice()
            oldSlice.hydrate(1)
            r.setPage('old', oldSlice)

            const next = new SliceRegistry()
            const newSlice = new TestSlice()
            newSlice.hydrate(2)
            next.setPage('new', newSlice)

            r.adoptPage(next)

            expect(oldSlice.isDestroyed()).toBe(true)
            expect(r.get('old')).toBeUndefined()
            expect(r.get('new')).toBe(newSlice)
            expect(newSlice.isDestroyed()).toBe(false)
            expect(newSlice.getState()).toBe(2)
            // Инстансы переехали — исходный реестр пуст.
            expect(next.get('new')).toBeUndefined()
        })

        it('одинаковый ключ — старый уничтожается, новый побеждает', () => {
            const r = new SliceRegistry()
            const oldSlice = new TestSlice()
            r.setPage('x', oldSlice)

            const next = new SliceRegistry()
            const newSlice = new TestSlice()
            next.setPage('x', newSlice)

            r.adoptPage(next)

            expect(oldSlice.isDestroyed()).toBe(true)
            expect(r.get('x')).toBe(newSlice)
        })

        it('не трогает global', () => {
            const r = new SliceRegistry()
            const g = new TestSlice()
            r.setGlobal('g', g)
            const next = new SliceRegistry()
            next.setPage('p', new TestSlice())

            r.adoptPage(next)

            expect(g.isDestroyed()).toBe(false)
            expect(r.get('g')).toBe(g)
            expect(r.get('p')).toBeDefined()
        })

        it('source === this — no-op', () => {
            const r = new SliceRegistry()
            const s = new TestSlice()
            r.setPage('x', s)

            expect(() => r.adoptPage(r)).not.toThrow()

            expect(s.isDestroyed()).toBe(false)
            expect(r.get('x')).toBe(s)
        })

        it('пустой source — уничтожает старые page-слайсы', () => {
            const r = new SliceRegistry()
            const s = new TestSlice()
            r.setPage('x', s)

            r.adoptPage(new SliceRegistry())

            expect(s.isDestroyed()).toBe(true)
            expect(r.get('x')).toBeUndefined()
        })
    })
})
