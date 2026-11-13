import { describe, expect, it } from 'vitest'
import { negotiateAcceptLanguage, resolveRequestLocale } from './negotiate'
import type { TustenI18nConfig } from '../../types'

const i18n: TustenI18nConfig = { defaultLocale: 'ru', locales: ['ru', 'en'] }

describe('resolveRequestLocale: приоритет источников', () => {
    it('cookie важнее Accept-Language', () => {
        const locale = resolveRequestLocale(
            { cookie: 'tusten_locale=en', acceptLanguage: 'ru-RU,ru;q=0.9' },
            i18n,
        )
        expect(locale).toBe('en')
    })

    it('без cookie — берёт Accept-Language', () => {
        expect(resolveRequestLocale({ acceptLanguage: 'en-US,en;q=0.9' }, i18n)).toBe('en')
    })

    it('ничего не задано — defaultLocale', () => {
        expect(resolveRequestLocale({}, i18n)).toBe('ru')
    })

    it('cookie с неизвестной locale игнорируется, работает Accept-Language', () => {
        const locale = resolveRequestLocale({ cookie: 'tusten_locale=de', acceptLanguage: 'en' }, i18n)
        expect(locale).toBe('en')
    })

    it('cookie-значение вне locales не попадает в результат (защита от подмены)', () => {
        expect(resolveRequestLocale({ cookie: 'tusten_locale=../../etc' }, i18n)).toBe('ru')
    })

    it('битый percent-encoding в cookie не бросает, а даёт fallback', () => {
        expect(() => resolveRequestLocale({ cookie: 'tusten_locale=%E0%A4%A' }, i18n)).not.toThrow()
        expect(resolveRequestLocale({ cookie: 'tusten_locale=%E0%A4%A' }, i18n)).toBe('ru')
    })

    it('ищет нужную cookie среди других пар', () => {
        const locale = resolveRequestLocale({ cookie: 'sid=abc; tusten_locale=en; theme=dark' }, i18n)
        expect(locale).toBe('en')
    })
})

describe('negotiateAcceptLanguage', () => {
    it('учитывает q: более высокий приоритет побеждает, даже если стоит позже', () => {
        expect(negotiateAcceptLanguage('ru;q=0.5, en;q=0.9', ['ru', 'en'])).toBe('en')
    })

    it('q=0 означает «не хочу» и не выбирается', () => {
        expect(negotiateAcceptLanguage('en;q=0, ru;q=0.1', ['ru', 'en'])).toBe('ru')
    })

    it('без q язык имеет приоритет 1, порядок заголовка сохраняется при равенстве', () => {
        expect(negotiateAcceptLanguage('en, ru', ['ru', 'en'])).toBe('en')
        expect(negotiateAcceptLanguage('ru, en', ['ru', 'en'])).toBe('ru')
    })

    it('регистр не важен', () => {
        expect(negotiateAcceptLanguage('EN-us', ['ru', 'en'])).toBe('en')
    })

    it('основной подтег: en-GB подходит к locale en', () => {
        expect(negotiateAcceptLanguage('en-GB', ['ru', 'en'])).toBe('en')
    })

    it('точное совпадение важнее основного подтега, даже с меньшим q', () => {
        // `pt` с высоким q совпадает с pt-BR по основе, но `pt-PT;q=0.5` — точное.
        expect(negotiateAcceptLanguage('pt;q=0.9, pt-PT;q=0.5', ['pt-BR', 'pt-PT'])).toBe('pt-PT')
    })

    it('`*` и пустые элементы игнорируются', () => {
        expect(negotiateAcceptLanguage('*, , ', ['ru', 'en'])).toBeUndefined()
    })

    it('ничего не подошло — undefined', () => {
        expect(negotiateAcceptLanguage('fr-FR,de;q=0.8', ['ru', 'en'])).toBeUndefined()
    })

    it('пустой заголовок — undefined', () => {
        expect(negotiateAcceptLanguage(undefined, ['ru'])).toBeUndefined()
        expect(negotiateAcceptLanguage('', ['ru'])).toBeUndefined()
    })
})
