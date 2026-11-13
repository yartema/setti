import { describe, expect, it } from 'vitest'
import { i18nTestPlugin } from './i18n-test'

/**
 * Достаёт хуки плагина как функции (tusten отдаёт функциональную форму).
 *
 * @returns resolveId и load заглушки.
 */
function hooks() {
    const plugin = i18nTestPlugin()
    return {
        resolveId: plugin.resolveId as unknown as (id: string) => string | null,
        load: plugin.load as unknown as (id: string) => string | null,
    }
}

describe('i18nTestPlugin', () => {
    it('resolveId: i18n! → заглушка; прочие id (в т.ч. i18n: без !) не трогает', () => {
        const { resolveId } = hooks()
        expect(resolveId('i18n!HomePage')).toBe('\0tusten-i18n-stub:i18n!HomePage')
        expect(resolveId('i18n:HomePage')).toBeNull()
        expect(resolveId('react')).toBeNull()
        expect(resolveId('./i18n-helper')).toBeNull()
    })

    it('load: заглушка возвращает ключ без перевода (ctx игнорируется)', () => {
        const { resolveId, load } = hooks()
        const id = resolveId('i18n!HomePage')!
        const code = load(id)!
        // Вычисляем `export default` как выражение: тест проверяет поведение, а не текст.
        const rk = new Function(code.replace('export default ', 'return '))() as (key: string, ctx?: string) => string
        expect(rk('Помощь')).toBe('Помощь')
        expect(rk('Помощь', 'Поддержка')).toBe('Помощь')
    })

    it('load: не-заглушки не трогает', () => {
        expect(hooks().load('/some/file.ts')).toBeNull()
    })
})
