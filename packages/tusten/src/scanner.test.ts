import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scan, scanI18n } from './scanner'
import { TustenError } from './errors'

/** Временный корень — создаётся в `beforeAll`, удаляется в `afterAll`. */
let tmpRoot: string

beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'tusten-scanner-'))
})

afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
})

/**
 * Создаёт файл (с промежуточными папками).
 *
 * @param rel путь относительно `tmpRoot`.
 * @param content содержимое.
 */
async function makeFile(rel: string, content: string): Promise<void> {
    const abs = join(tmpRoot, rel)
    await mkdir(join(abs, '..'), { recursive: true })
    await writeFile(abs, content)
}

describe('scan', () => {
    it('несуществующий каталог → пустой результат (не падает)', async () => {
        const result = await scan(join(tmpRoot, 'nope'))
        expect(result.routeModules).toEqual([])
        expect(result.loaderModules).toEqual([])
    })

    it('пустой clientDir → пустой результат', async () => {
        const empty = join(tmpRoot, 'empty')
        await mkdir(empty, { recursive: true })
        const result = await scan(empty)
        expect(result.routeModules).toEqual([])
        expect(result.loaderModules).toEqual([])
    })

    it('находит router.ts на первом уровне подкаталогов', async () => {
        const clientDir = join(tmpRoot, 'with-router')
        await makeFile(
            'with-router/HomePage/router.ts',
            `export default [
         {
           id: 'home',
           index: true,
           title: 'Home',
           type: 'main',
           contentConfig: {
             workspaceConfig: { template: 'HomePage/view:View' },
             prefetchConfig: { configLoader: 'HomePage/Root' },
           },
         },
       ]
      `,
        )
        const result = await scan(clientDir)
        expect(result.routeModules).toHaveLength(1)
        expect(result.routeModules[0].routes).toHaveLength(1)
        expect(result.routeModules[0].routes[0].id).toBe('home')
    })

    it('router.ts не на первом уровне — игнорируется', async () => {
        const clientDir = join(tmpRoot, 'nested')
        await makeFile('nested/A/B/router.ts', `export default []`)
        const result = await scan(clientDir)
        // B/router.ts на втором уровне — не сканируется
        expect(result.routeModules).toHaveLength(0)
    })

    it('находит *.loader.ts рекурсивно', async () => {
        const clientDir = join(tmpRoot, 'with-loaders')
        await makeFile(
            'with-loaders/User.loader.ts',
            `
       export default {
         userInfo: { dataFactoryName: 'User:userInfoLoader' },
       }
      `,
        )
        await makeFile(
            'with-loaders/deep/nested/Other.loader.ts',
            `
       export default{
         other: { dataFactoryName: 'Other:Loader' },
       }
      `,
        )
        const result = await scan(clientDir)
        expect(result.loaderModules).toHaveLength(2)
        const names = result.loaderModules.map((l) => Object.keys(l.map).join(','))
        expect(names).toContain('userInfo')
        expect(names).toContain('other')
    })

    it('игнорирует node_modules', async () => {
        const clientDir = join(tmpRoot, 'with-nm')
        await makeFile('with-nm/A/router.ts', `export default []`)
        await makeFile('with-nm/node_modules/evil/router.ts', `export default []`)
        const result = await scan(clientDir)
        expect(result.routeModules).toHaveLength(1)
        const f = result.routeModules[0].file.replace(/\\/g, '/')
        expect(f).toContain('with-nm/A/router.ts')
        expect(f).not.toContain('node_modules')
    })

    it('игнорирует папки с точкой в начале', async () => {
        const clientDir = join(tmpRoot, 'with-dot')
        await makeFile('with-dot/.cache/router.ts', `export default []`)
        await makeFile('with-dot/A/router.ts', `export default []`)
        const result = await scan(clientDir)
        expect(result.routeModules).toHaveLength(1)
    })

    it('router.ts без default array — TustenError', async () => {
        const clientDir = join(tmpRoot, 'invalid-router')
        await makeFile('invalid-router/Bad/router.ts', `export const routes = []`)
        await expect(scan(clientDir)).rejects.toThrow(TustenError)
        await expect(scan(clientDir)).rejects.toThrow(/must default-export an array/)
    })

    it('router.ts с элементом без id — TustenError', async () => {
        const clientDir = join(tmpRoot, 'bad-route')
        await makeFile('bad-route/Bad/router.ts', `export default [{ title: 'No ID' }]`)
        await expect(scan(clientDir)).rejects.toThrow(/missing "id"/)
    })

    it('*.loader.ts без валидных фабрик — TustenError', async () => {
        const clientDir = join(tmpRoot, 'bad-loader')
        await makeFile('bad-loader/X.loader.ts', `export const x = { userInfo: {} }`)
        await expect(scan(clientDir)).rejects.toThrow(/must have "dataFactoryName: string"/)
    })
})

describe('scanI18n', () => {
    const i18n = { defaultLocale: 'ru', locales: ['ru', 'en'] }

    it('i18n выключен (null) — пустой реестр, даже если словари есть', async () => {
        await makeFile('i18n-off/HomePage/lang/en/en.json', `{"a":"b"}`)
        expect(scanI18n(join(tmpRoot, 'i18n-off'), null)).toEqual({})
    })

    it('несуществующий clientDir — пустой реестр (не падает)', () => {
        expect(scanI18n(join(tmpRoot, 'i18n-nope'), i18n)).toEqual({})
    })

    it('находит словари по каждой locale из конфига, пропуская отсутствующие', async () => {
        const clientDir = join(tmpRoot, 'i18n-found')
        await makeFile('i18n-found/HomePage/lang/ru/ru.json', `{}`)
        await makeFile('i18n-found/HomePage/lang/en/en.json', `{}`)
        // Локаль вне конфига не попадает в реестр, даже если файл лежит рядом.
        await makeFile('i18n-found/HomePage/lang/de/de.json', `{}`)
        // Файл с другим именем не считается словарём.
        await makeFile('i18n-found/Other/lang/en/index.json', `{}`)

        const registry = scanI18n(clientDir, i18n)
        expect(Object.keys(registry)).toEqual(['HomePage'])
        expect(Object.keys(registry.HomePage).sort()).toEqual(['en', 'ru'])
        expect(registry.HomePage.en.endsWith(join('HomePage', 'lang', 'en', 'en.json'))).toBe(true)
    })

    it('модуль без словарей не попадает в реестр; node_modules и dot-папки пропускаются', async () => {
        const clientDir = join(tmpRoot, 'i18n-skip')
        await makeFile('i18n-skip/Empty/router.ts', `export default []`)
        await makeFile('i18n-skip/node_modules/lang/en/en.json', `{}`)
        await makeFile('i18n-skip/.cache/lang/en/en.json', `{}`)
        await makeFile('i18n-skip/Real/lang/en/en.json', `{}`)

        expect(Object.keys(scanI18n(clientDir, i18n))).toEqual(['Real'])
    })
})
