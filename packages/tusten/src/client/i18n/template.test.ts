import { describe, expect, it } from 'vitest'
import { template } from './template'
import { setLocaleResolver } from './locale'
import { TustenError } from '../../errors'

describe('template: подстановка {name}', () => {
    it('подставляет параметры', () => {
        expect(template('Привет, {name}!', { name: 'Аня' }, 'ru')).toBe('Привет, Аня!')
    })

    it('число и булево приводятся через String', () => {
        expect(template('{a} / {b}', { a: 3, b: false }, 'en')).toBe('3 / false')
    })

    it('нет параметра — плейсхолдер остаётся как есть, без исключения', () => {
        expect(template('Привет, {name}!', {}, 'ru')).toBe('Привет, {name}!')
    })

    it('null/undefined — тоже отсутствие параметра', () => {
        expect(template('{a}', { a: null }, 'en')).toBe('{a}')
        expect(template('{a}', { a: undefined }, 'en')).toBe('{a}')
    })

    it('параметры — только собственные свойства (не из прототипа)', () => {
        expect(template('{constructor}', {}, 'en')).toBe('{constructor}')
    })

    it('строка без спецсимволов возвращается без разбора', () => {
        expect(template('Просто текст # 100%', {}, 'ru')).toBe('Просто текст # 100%')
    })

    it('одиночный обратный слеш (например, путь) — обычный текст', () => {
        expect(template(String.raw`C:\path\to {x}`, { x: 'ok' }, 'en')).toBe(String.raw`C:\path\to ok`)
    })
})

describe('template: plural', () => {
    const ru = '{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}'
    const en = '{n, plural, one {# file} other {# files}}'

    it.each([
        [0, 'файлов'],
        [1, 'файл'],
        [2, 'файла'],
        [4, 'файла'],
        [5, 'файлов'],
        [11, 'файлов'],
        [14, 'файлов'],
        [21, 'файл'],
        [22, 'файла'],
        [25, 'файлов'],
        [111, 'файлов'],
    ])('ru: n=%i → %s', (n, word) => {
        expect(template(ru, { n }, 'ru')).toBe(`${n} ${word}`)
    })

    it('en: один/другие', () => {
        expect(template(en, { n: 1 }, 'en')).toBe('1 file')
        expect(template(en, { n: 0 }, 'en')).toBe('0 files')
        expect(template(en, { n: 2 }, 'en')).toBe('2 files')
    })

    it('точное совпадение =N побеждает категорию', () => {
        const msg = '{n, plural, =0 {нет файлов} one {# файл} few {# файла} many {# файлов} other {# файла}}'
        expect(template(msg, { n: 0 }, 'ru')).toBe('нет файлов')
        expect(template(msg, { n: 1 }, 'ru')).toBe('1 файл')
    })

    it('строковое число допускается', () => {
        expect(template(en, { n: '3' }, 'en')).toBe('3 files')
    })

    it('не число — плейсхолдер plural остаётся как есть', () => {
        expect(template(en, { n: 'много' }, 'en')).toBe(en)
        expect(template(en, {}, 'en')).toBe(en)
    })

    it('# форматируется по локали (разделитель разрядов)', () => {
        expect(template('{n, plural, other {# items}}', { n: 1234567 }, 'en')).toBe('1,234,567 items')
    })

    it('плейсхолдеры внутри формы plural работают', () => {
        const msg = '{n, plural, one {{user} has # file} other {{user} has # files}}'
        expect(template(msg, { n: 2, user: 'Аня' }, 'en')).toBe('Аня has 2 files')
    })

    it('локаль по умолчанию берётся из резолвера', () => {
        setLocaleResolver(() => 'en')
        try {
            expect(template(en, { n: 5 })).toBe('5 files')
        } finally {
            setLocaleResolver(() => undefined)
        }
    })
})

describe('template: экранирование', () => {
    it('\\{ \\} \\# \\\\ дают литералы', () => {
        expect(template(String.raw`\{a\} \# \\`, {}, 'en')).toBe('{a} # \\')
    })

    it('# экранируется и внутри plural', () => {
        expect(template(String.raw`{n, plural, other {\# # items}}`, { n: 3 }, 'en')).toBe('# 3 items')
    })
})

describe('template: синтаксические ошибки → TustenError', () => {
    it.each([
        ['незакрытая {', 'Hello {name'],
        ['лишняя }', 'Hello }'],
        ['пустые фигурные скобки', 'Hi {}'],
        ['plural без other', '{n, plural, one {# a}}'],
        ['неизвестная категория', '{n, plural, some {x} other {y}}'],
        ['вложенный plural', '{n, plural, other {{m, plural, other {x}}}}'],
        ['select не поддержан', '{g, select, a {x} other {y}}'],
        ['незакрытая форма', '{n, plural, one {# a'],
    ])('%s', (_, src) => {
        expect(() => template(src, { n: 1 }, 'en')).toThrow(TustenError)
    })
})
