import { describe, expect, it } from 'vitest'
import { buildI18nBootScript, serializeForScript } from './boot'

const LS = '\u2028'
const PS = '\u2029'

describe('serializeForScript', () => {
    it('не даёт строке перевода закрыть <script>', () => {
        const out = serializeForScript({ text: '</script><script>alert(1)</script>' })
        expect(out).not.toContain('<')
        expect(out).not.toContain('>')
        expect(out).not.toContain('</script')
    })

    it('экранирует & и разделители строк U+2028 / U+2029', () => {
        const out = serializeForScript({ text: `a&b${LS}c${PS}d` })
        expect(out).not.toContain('&')
        expect(out).not.toContain(LS)
        expect(out).not.toContain(PS)
    })

    it('результат остаётся валидным JSON с исходными значениями', () => {
        const value = {
            locale: 'en',
            dicts: { HomePage: { Помощь: `</script> &${LS}"quoted"` } },
        }
        expect(JSON.parse(serializeForScript(value))).toEqual(value)
    })
})

describe('buildI18nBootScript', () => {
    it('строит inline-скрипт с locale и словарями', () => {
        const html = buildI18nBootScript('en', { HomePage: { Помощь: 'Help' } })
        expect(html.startsWith('<script>window.__ROOT_I18N__=')).toBe(true)
        expect(html.endsWith('</script>')).toBe(true)
        const json = html.slice('<script>window.__ROOT_I18N__='.length, -'</script>'.length)
        expect(JSON.parse(json)).toEqual({ locale: 'en', dicts: { HomePage: { Помощь: 'Help' } } })
    })

    it('пустой набор словарей — только locale', () => {
        const html = buildI18nBootScript('ru', {})
        expect(html).toContain('"locale":"ru"')
        expect(html).toContain('"dicts":{}')
    })
})
