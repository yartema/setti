import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { generateI18nDictModule, generateI18nModule, parseDictionary } from './i18n'
import { tustenPlugin } from './plugin'
import { loadConfig } from '../config'
import { buildRouteTree } from '../route-tree'
import { TustenError } from '../errors'

describe('parseDictionary', () => {
    it('разбирает словарь ключ → строка', () => {
        expect(parseDictionary(`{"Помощь": "Help", "Привет, {name}!": "Hi, {name}!"}`, 'x.json')).toEqual({
            Помощь: 'Help',
            'Привет, {name}!': 'Hi, {name}!',
        })
    })

    it('битый JSON — TustenError с путём к файлу', () => {
        expect(() => parseDictionary('{"a": ', 'HomePage/lang/en/en.json')).toThrow(TustenError)
        expect(() => parseDictionary('{"a": ', 'HomePage/lang/en/en.json')).toThrow(/Invalid JSON.*en\.json/)
    })

    it('корень не объект (массив / строка) — TustenError', () => {
        expect(() => parseDictionary('["a"]', 'x.json')).toThrow(/must be a JSON object/)
        expect(() => parseDictionary('"a"', 'x.json')).toThrow(/must be a JSON object/)
    })

    it('нестроковое значение — TustenError с именем ключа', () => {
        expect(() => parseDictionary('{"count": 5}', 'x.json')).toThrow(/value for key "count" must be a string/)
    })
})

describe('generateI18nModule', () => {
    it('создаёт createRk с ленивым загрузчиком на каждую locale', () => {
        const code = generateI18nModule('HomePage', { en: '/a/en.json', ru: '/a/ru.json' })
        expect(code).toContain(`import { createRk } from '@tusten/core/client'`)
        expect(code).toContain(`export default createRk("HomePage", {`)
        expect(code).toContain(`"en": () => import("i18n-dict:HomePage:en"),`)
        expect(code).toContain(`"ru": () => import("i18n-dict:HomePage:ru"),`)
    })

    it('без словарей — пустой объект загрузчиков (rk вернёт ключ)', () => {
        expect(generateI18nModule('Empty', {})).toContain(`createRk("Empty", {\n})`)
    })
})

describe('generateI18nDictModule', () => {
    it('генерирует export default с JSON-словарём', () => {
        const code = generateI18nDictModule({ Помощь: 'Help' })
        expect(code.startsWith('export default {')).toBe(true)
        // Результат должен быть валидным JS и вернуть тот же словарь.
        const body = code.replace(/^export default /, '').trim()
        expect(JSON.parse(body)).toEqual({ Помощь: 'Help' })
    })
})

// ----------------------------------------------------------------------------
// Хуки плагина: resolveId / load на реальной временной папке.
// ----------------------------------------------------------------------------

let tmpRoot: string

beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'tusten-i18n-plugin-'))
})

afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
})

/**
 * Поднимает проект с i18n и возвращает Vite-плагин tusten.
 *
 * @param name имя подпапки проекта.
 * @param files относительные пути → содержимое.
 * @returns плагин tusten для этого проекта.
 */
async function makePlugin(name: string, files: Record<string, string>): Promise<Plugin> {
    const projectDir = join(tmpRoot, name)
    await mkdir(projectDir, { recursive: true })
    for (const [rel, content] of Object.entries(files)) {
        await mkdir(join(projectDir, rel, '..'), { recursive: true })
        await writeFile(join(projectDir, rel), content)
    }
    await writeFile(
        join(projectDir, 'tusten.config.ts'),
        `export default { i18n: { defaultLocale: 'ru', locales: ['ru', 'en'] } }\n`,
    )
    const config = await loadConfig(projectDir)
    const clientDir = join(projectDir, 'client')
    const routeTree = buildRouteTree([], [], config)
    return tustenPlugin({ projectDir, clientDir, config, routeTree })
}

/**
 * Достаёт `resolveId` плагина как функцию. Vite допускает объектную форму хука,
 * но tusten всегда задаёт функцию — приведение безопасно в тестах.
 *
 * @param plugin плагин tusten.
 * @returns функция резолва.
 */
function resolveIdOf(plugin: Plugin): (id: string) => string | null {
    return plugin.resolveId as unknown as (id: string) => string | null
}

/**
 * Достаёт `load` плагина как функцию с контекстом Rollup (`this.addWatchFile`).
 *
 * @param plugin плагин tusten.
 * @returns функция загрузки.
 */
function loadOf(plugin: Plugin): (this: unknown, id: string) => Promise<string | null> {
    return plugin.load as unknown as (this: unknown, id: string) => Promise<string | null>
}

describe('tustenPlugin: i18n virtual modules', () => {
    it('resolveId: i18n!<Module> → \\0i18n:<Module>; i18n-dict:* → \\0; прочее не трогает', async () => {
        const plugin = await makePlugin('resolve', {})
        const resolveId = resolveIdOf(plugin)
        expect(resolveId('i18n!HomePage')).toBe('\0i18n:HomePage')
        // Единственный пользовательский синтаксис: `i18n:` без `!` плагин не резолвит.
        expect(resolveId('i18n:HomePage')).toBeNull()
        expect(resolveId('i18n-dict:HomePage:en')).toBe('\0i18n-dict:HomePage:en')
        expect(resolveId('react')).toBeNull()
    })

    it('load модуля: загрузчики только для существующих словарей', async () => {
        const plugin = await makePlugin('load-module', {
            'client/HomePage/lang/en/en.json': `{"Помощь": "Help"}`,
            'client/HomePage/lang/ru/ru.json': `{}`,
        })
        const load = loadOf(plugin)
        const code = (await load.call({ addWatchFile() {} }, '\0i18n:HomePage')) as string
        expect(code).toContain(`"en": () => import("i18n-dict:HomePage:en")`)
        expect(code).toContain(`"ru": () => import("i18n-dict:HomePage:ru")`)
    })

    it('load словаря: JSON → export default; addWatchFile вызван для HMR', async () => {
        const plugin = await makePlugin('load-dict', {
            'client/HomePage/lang/en/en.json': `{"Помощь": "Help"}`,
        })
        const load = loadOf(plugin)
        const watched: string[] = []
        const code = (await load.call(
            { addWatchFile: (f: string) => watched.push(f) },
            '\0i18n-dict:HomePage:en',
        )) as string
        expect(code).toContain(`"Помощь": "Help"`)
        expect(watched).toHaveLength(1)
        expect(watched[0].endsWith(join('HomePage', 'lang', 'en', 'en.json'))).toBe(true)
    })

    it('load словаря с битым JSON — TustenError на сборке', async () => {
        const plugin = await makePlugin('load-broken', {
            'client/HomePage/lang/en/en.json': `{"Помощь": `,
        })
        const load = loadOf(plugin)
        await expect(load.call({ addWatchFile() {} }, '\0i18n-dict:HomePage:en')).rejects.toThrow(/Invalid JSON/)
    })

    it('модуль без словарей — createRk без загрузчиков (не ошибка)', async () => {
        const plugin = await makePlugin('load-empty', {})
        const load = loadOf(plugin)
        const code = (await load.call({ addWatchFile() {} }, '\0i18n:Ghost')) as string
        expect(code).toContain(`createRk("Ghost", {\n})`)
    })
})
