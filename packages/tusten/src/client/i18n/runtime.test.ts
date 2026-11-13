import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { I18nLoader } from './create-rk'

/**
 * Состояние рантайма модульное, поэтому каждый тест берёт свежие модули:
 * иначе boot и реестр одного теста утекут в следующий.
 */
type Modules = {
    createRk: typeof import('./create-rk').createRk
    runtime: typeof import('./runtime')
    locale: typeof import('./locale')
}

let mods: Modules

beforeEach(async () => {
    vi.resetModules()
    const [createRkMod, runtime, locale] = await Promise.all([
        import('./create-rk'),
        import('./runtime'),
        import('./locale'),
    ])
    mods = { createRk: createRkMod.createRk, runtime, locale }
})

afterEach(() => {
    mods.runtime.setI18nUsageHook(undefined)
})

/**
 * Загрузчик, который считает свои вызовы.
 *
 * @param dict словарь.
 * @returns загрузчик и spy.
 */
function countingLoader(dict: Record<string, string>): { loader: I18nLoader; spy: ReturnType<typeof vi.fn> } {
    const spy = vi.fn(() => Promise.resolve({ default: dict }))
    return { loader: spy as unknown as I18nLoader, spy }
}

describe('initI18n: гидрация из HTML', () => {
    it('модуль, созданный после initI18n, сразу переводит без await', () => {
        mods.runtime.initI18n({ locale: 'en', dicts: { HomePage: { Помощь: 'Help' } } })
        const rk = mods.createRk('HomePage', {})
        expect(rk('Помощь')).toBe('Help')
    })

    it('модуль, созданный до initI18n, получает словарь при инициализации', () => {
        const rk = mods.createRk('HomePage', {})
        expect(rk('Помощь')).toBe('Помощь')

        mods.runtime.initI18n({ locale: 'en', dicts: { HomePage: { Помощь: 'Help' } } })
        expect(rk('Помощь')).toBe('Help')
    })

    it('initI18n задаёт locale резолвера', () => {
        mods.runtime.initI18n({ locale: 'en' })
        expect(mods.locale.getLocale()).toBe('en')
    })

    it('модуль без словаря в HTML ходит по loader, а не получает чужой словарь', async () => {
        mods.runtime.initI18n({ locale: 'en', dicts: { HomePage: { Помощь: 'Help' } } })
        const { loader, spy } = countingLoader({ Hello: 'Hi' })
        const rk = mods.createRk('AboutPage', { en: loader })

        expect(rk('Hello')).toBe('Hello')
        expect(spy).not.toHaveBeenCalled()

        await mods.runtime.loadRegisteredDictionaries()
        expect(spy).toHaveBeenCalledTimes(1)
        expect(rk('Hello')).toBe('Hi')
    })
})

describe('loadRegisteredDictionaries', () => {
    it('не делает запросов для словарей, уже пришедших из HTML', async () => {
        mods.runtime.initI18n({ locale: 'en', dicts: { HomePage: { Помощь: 'Help' } } })
        const { loader, spy } = countingLoader({ Помощь: 'Other' })
        mods.createRk('HomePage', { en: loader })

        await mods.runtime.loadRegisteredDictionaries()
        expect(spy).not.toHaveBeenCalled()
    })

    it('без locale — no-op', async () => {
        const { loader, spy } = countingLoader({ a: 'b' })
        mods.createRk('HomePage', { en: loader })

        await mods.runtime.loadRegisteredDictionaries(undefined)
        expect(spy).not.toHaveBeenCalled()
    })

    it('явный locale важнее резолвера (нужно SSR, где locale на запрос)', async () => {
        const { loader: en, spy: enSpy } = countingLoader({ a: 'en' })
        const { loader: ru, spy: ruSpy } = countingLoader({ a: 'ru' })
        mods.createRk('HomePage', { en, ru })

        await mods.runtime.loadRegisteredDictionaries('ru')
        expect(ruSpy).toHaveBeenCalledTimes(1)
        expect(enSpy).not.toHaveBeenCalled()
    })
})

describe('getRegisteredDictionary и dictionary', () => {
    it('возвращает копию загруженного словаря', () => {
        const rk = mods.createRk('HomePage', {})
        rk.seed('en', { Помощь: 'Help' })

        const copy = mods.runtime.getRegisteredDictionary('HomePage', 'en')
        expect(copy).toEqual({ Помощь: 'Help' })
        copy!['Помощь'] = 'mutated'
        expect(rk.dictionary('en')).toEqual({ Помощь: 'Help' })
    })

    it('для незагруженного словаря и неизвестного модуля — undefined', () => {
        mods.createRk('HomePage', {})
        expect(mods.runtime.getRegisteredDictionary('HomePage', 'en')).toBeUndefined()
        expect(mods.runtime.getRegisteredDictionary('Ghost', 'en')).toBeUndefined()
    })
})

describe('setI18nUsageHook: учёт использования на сервере', () => {
    it('получает имя модуля при вызове rk с locale', () => {
        const used: string[] = []
        mods.runtime.setI18nUsageHook((id) => used.push(id))
        mods.runtime.initI18n({ locale: 'en' })

        const rk = mods.createRk('HomePage', {})
        rk('Помощь')
        rk('Поддержка', 'ctx')
        expect(used).toEqual(['HomePage', 'HomePage'])
    })

    it('без locale хук не вызывается', () => {
        const hook = vi.fn()
        mods.runtime.setI18nUsageHook(hook)
        const rk = mods.createRk('HomePage', {})
        rk('Помощь')
        expect(hook).not.toHaveBeenCalled()
    })
})
