import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scan } from './scanner'
import { SettiError } from './errors'

/** Временный корень — создаётся в `beforeAll`, удаляется в `afterAll`. */
let tmpRoot: string

beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'setti-scanner-'))
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

    it('router.ts без default array — SettiError', async () => {
        const clientDir = join(tmpRoot, 'invalid-router')
        await makeFile('invalid-router/Bad/router.ts', `export const routes = []`)
        await expect(scan(clientDir)).rejects.toThrow(SettiError)
        await expect(scan(clientDir)).rejects.toThrow(/must default-export an array/)
    })

    it('router.ts с элементом без id — SettiError', async () => {
        const clientDir = join(tmpRoot, 'bad-route')
        await makeFile('bad-route/Bad/router.ts', `export default [{ title: 'No ID' }]`)
        await expect(scan(clientDir)).rejects.toThrow(/missing "id"/)
    })

    it('*.loader.ts без валидных фабрик — SettiError', async () => {
        const clientDir = join(tmpRoot, 'bad-loader')
        await makeFile('bad-loader/X.loader.ts', `export const x = { userInfo: {} }`)
        await expect(scan(clientDir)).rejects.toThrow(/must have "dataFactoryName: string"/)
    })
})
