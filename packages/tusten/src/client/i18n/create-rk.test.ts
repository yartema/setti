import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRk, type I18nLoader } from './create-rk'
import { setLocaleResolver } from './locale'
import { TustenError } from '../../errors'

/** Ставит текущую locale для теста. */
function useLocale(locale: string | undefined): void {
    setLocaleResolver(() => locale)
}

afterEach(() => {
    setLocaleResolver(() => undefined)
})

/**
 * Загрузчик, отдающий словарь как namespace модуля.
 *
 * @param dict словарь.
 * @returns загрузчик.
 */
function loaderOf(dict: Record<string, string>): I18nLoader {
    return () => Promise.resolve({ default: dict })
}

describe('createRk: поиск перевода', () => {
    it('без locale — возвращает ключ', () => {
        const rk = createRk('HomePage', {})
        expect(rk('Помощь')).toBe('Помощь')
    })

    it('locale без загруженного словаря — возвращает ключ', () => {
        useLocale('en')
        const rk = createRk('HomePage', { en: loaderOf({ Помощь: 'Help' }) })
        expect(rk('Помощь')).toBe('Помощь')
    })

    it('после seed — переводит', () => {
        useLocale('en')
        const rk = createRk('HomePage', {})
        rk.seed('en', { Помощь: 'Help' })
        expect(rk('Помощь')).toBe('Help')
    })

    it('ctx@@key имеет приоритет над key', () => {
        useLocale('en')
        const rk = createRk('HomePage', {})
        rk.seed('en', { Помощь: 'Help', 'Поддержка@@Помощь': 'Support' })
        expect(rk('Помощь', 'Поддержка')).toBe('Support')
        expect(rk('Помощь', 'Другое')).toBe('Help')
        expect(rk('Помощь')).toBe('Help')
    })

    it('нет ни ctx@@key, ни key — возвращает исходный ключ', () => {
        useLocale('en')
        const rk = createRk('HomePage', {})
        rk.seed('en', { Другое: 'Other' })
        expect(rk('Помощь', 'Поддержка')).toBe('Помощь')
    })

    it('пустой перевод считается отсутствующим', () => {
        useLocale('en')
        const rk = createRk('HomePage', {})
        rk.seed('en', { Помощь: '' })
        expect(rk('Помощь')).toBe('Помощь')
    })

    it('ключи из прототипа не находятся (constructor, __proto__, toString)', () => {
        useLocale('en')
        const rk = createRk('HomePage', {})
        rk.seed('en', {})
        expect(rk('constructor')).toBe('constructor')
        expect(rk('toString')).toBe('toString')
        expect(rk('__proto__')).toBe('__proto__')
    })

    it('словари разных locale не смешиваются', () => {
        const rk = createRk('HomePage', {})
        rk.seed('en', { a: 'A-en' })
        rk.seed('ru', { a: 'A-ru' })
        useLocale('en')
        expect(rk('a')).toBe('A-en')
        useLocale('ru')
        expect(rk('a')).toBe('A-ru')
    })
})

describe('createRk: load', () => {
    it('грузит словарь текущей locale и делает его доступным', async () => {
        useLocale('en')
        const rk = createRk('HomePage', { en: loaderOf({ Помощь: 'Help' }) })
        await rk.load()
        expect(rk('Помощь')).toBe('Help')
    })

    it('явно переданная locale важнее текущей', async () => {
        useLocale('en')
        const rk = createRk('HomePage', { ru: loaderOf({ a: 'А' }) })
        await rk.load('ru')
        useLocale('ru')
        expect(rk('a')).toBe('А')
    })

    it('параллельные load для одной locale вызывают загрузчик один раз', async () => {
        useLocale('en')
        const loader = vi.fn(loaderOf({ a: 'A' }))
        const rk = createRk('HomePage', { en: loader })
        await Promise.all([rk.load(), rk.load(), rk.load()])
        expect(loader).toHaveBeenCalledTimes(1)
        await rk.load()
        expect(loader).toHaveBeenCalledTimes(1)
    })

    it('locale без загрузчика — no-op, без ошибок', async () => {
        useLocale('de')
        const rk = createRk('HomePage', { en: loaderOf({ a: 'A' }) })
        await expect(rk.load()).resolves.toBeUndefined()
        expect(rk('a')).toBe('a')
    })

    it('без текущей locale — no-op', async () => {
        const rk = createRk('HomePage', { en: loaderOf({ a: 'A' }) })
        await expect(rk.load()).resolves.toBeUndefined()
    })

    it('ошибка загрузчика пробрасывается, и повторная попытка работает', async () => {
        useLocale('en')
        const loader = vi
            .fn<I18nLoader>()
            .mockImplementationOnce(() => Promise.reject(new Error('network down')))
            .mockImplementationOnce(loaderOf({ a: 'A' }))
        const rk = createRk('HomePage', { en: loader })

        await expect(rk.load()).rejects.toThrow('network down')
        expect(rk('a')).toBe('a')

        await rk.load()
        expect(rk('a')).toBe('A')
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('модуль словаря без default — TustenError', async () => {
        useLocale('en')
        const rk = createRk('HomePage', {
            en: () => Promise.resolve({ default: undefined as unknown as Record<string, string> }),
        })
        await expect(rk.load()).rejects.toThrow(TustenError)
        await expect(rk.load()).rejects.toThrow(/no default export/)
    })
})
