import { describe, expect, it } from 'vitest'
import { currentRequestLocale, recordRequestI18nUse, runWithI18nContext } from './als'

/**
 * Пауза для проверки, что контекст переживает асинхронные границы.
 *
 * @param ms миллисекунды.
 * @returns промис.
 */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('i18n ALS', () => {
    it('вне запроса locale не задана, а учёт использования ничего не ломает', () => {
        expect(currentRequestLocale()).toBeUndefined()
        expect(() => recordRequestI18nUse('HomePage')).not.toThrow()
    })

    it('внутри контекста видна locale запроса и синхронно, и после await', async () => {
        await runWithI18nContext({ locale: 'en', used: new Set() }, async () => {
            expect(currentRequestLocale()).toBe('en')
            await delay(1)
            expect(currentRequestLocale()).toBe('en')
        })
    })

    it('параллельные запросы с разной locale не видят языка друг друга', async () => {
        const [a, b] = await Promise.all([
            runWithI18nContext({ locale: 'en', used: new Set() }, async () => {
                await delay(15)
                return currentRequestLocale()
            }),
            runWithI18nContext({ locale: 'ru', used: new Set() }, async () => {
                await delay(1)
                return currentRequestLocale()
            }),
        ])
        expect(a).toBe('en')
        expect(b).toBe('ru')
    })

    it('recordRequestI18nUse пишет в набор именно своего запроса', async () => {
        const first = { locale: 'en', used: new Set<string>() }
        const second = { locale: 'ru', used: new Set<string>() }
        await Promise.all([
            runWithI18nContext(first, async () => {
                await delay(5)
                recordRequestI18nUse('HomePage')
            }),
            runWithI18nContext(second, async () => {
                recordRequestI18nUse('AboutPage')
            }),
        ])
        expect([...first.used]).toEqual(['HomePage'])
        expect([...second.used]).toEqual(['AboutPage'])
    })
})
