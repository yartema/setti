import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocale, setLocale, setLocaleResolver } from './locale'
import { TustenError } from '../../errors'

afterEach(() => {
    setLocaleResolver(() => undefined)
    vi.unstubAllGlobals()
})

describe('getLocale / setLocaleResolver', () => {
    it('по умолчанию locale неизвестна', () => {
        expect(getLocale()).toBeUndefined()
    })

    it('резолвер задаёт locale', () => {
        setLocaleResolver(() => 'ru')
        expect(getLocale()).toBe('ru')
    })
})

describe('setLocale', () => {
    it('некорректная locale — TustenError (до обращения к браузеру)', () => {
        expect(() => setLocale('../etc')).toThrow(TustenError)
        expect(() => setLocale('')).toThrow(/Invalid locale/)
    })

    it('вне браузера — TustenError', () => {
        expect(() => setLocale('en')).toThrow(/only be called in the browser/)
    })

    it('в браузере — пишет cookie и перезагружает страницу', () => {
        const reload = vi.fn()
        const doc = { cookie: '' }
        vi.stubGlobal('document', doc)
        vi.stubGlobal('window', { location: { reload } })

        setLocale('pt-BR')

        expect(doc.cookie).toMatch(/^tusten_locale=pt-BR; path=\/; max-age=\d+; SameSite=Lax$/)
        expect(reload).toHaveBeenCalledOnce()
    })
})
