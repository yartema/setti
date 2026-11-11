import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from './config'
import { TustenError } from './errors'
import { defineConfig } from './define-config'

/** Временный корень. */
let tmpRoot: string

beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'tusten-config-'))
})

afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
})

/**
 * Создаёт пустой подкаталог для теста.
 *
 * @param name имя.
 * @returns абсолютный путь.
 */
async function makeProjectDir(name: string): Promise<string> {
    const dir = join(tmpRoot, name)
    await mkdir(dir, { recursive: true })
    return dir
}

describe('defineConfig', () => {
    it('возвращает тот же объект', () => {
        const cfg = { ssr: true, clientDir: 'app' }
        expect(defineConfig(cfg)).toBe(cfg)
    })

    it('пустой объект — валиден', () => {
        expect(defineConfig({})).toEqual({})
    })
})

describe('loadConfig', () => {
    it('нет конфига — TustenError', async () => {
        const dir = await makeProjectDir('empty-proj')
        await expect(loadConfig(dir)).rejects.toThrow(TustenError)
        await expect(loadConfig(dir)).rejects.toThrow(/Config not found/)
    })

    it('пустой конфиг — все дефолты', async () => {
        const dir = await makeProjectDir('defaults')
        await writeFile(join(dir, 'tusten.config.ts'), `export default {}\n`)
        const cfg = await loadConfig(dir)
        expect(cfg.ssr).toBe(true)
        expect(cfg.clientDir).toBe('client')
        expect(cfg.serverDir).toBe('server')
        expect(cfg.layouts).toEqual({})
        expect(cfg.server.port).toBe(3000)
        expect(cfg.server.host).toBe('localhost')
        expect(cfg.server.routes).toBeNull()
        expect(cfg.server.plugins).toBeNull()
        expect(cfg.fastify).toEqual({})
        expect(cfg.rpc.enabled).toBe(true)
        expect(cfg.rpc.url).toBe('/service')
        expect(cfg.css.main).toBe('styles/main.css')
        expect(cfg.build.outDir).toBe('dist')
        expect(cfg.middleware).toEqual([])
        expect(cfg.components).toEqual({
            error: null,
            loading: null,
            notFound: null,
        })
    })

    it('пользовательские значения сохраняются', async () => {
        const dir = await makeProjectDir('custom')
        await writeFile(
            join(dir, 'tusten.config.ts'),
            `export default {
        ssr: false,
        clientDir: 'app',
        serverDir: 'srv',
        layouts: { main: './l/Main', admin: './l/Admin' },
        server: { port: 4000, host: '127.0.0.1' },
        rpc: false,
        css: { main: 'styles/custom.css' },
        build: { outDir: 'build' },
      }\n`,
        )
        const cfg = await loadConfig(dir)
        expect(cfg.ssr).toBe(false)
        expect(cfg.clientDir).toBe('app')
        expect(cfg.serverDir).toBe('srv')
        expect(cfg.layouts).toEqual({ main: './l/Main', admin: './l/Admin' })
        expect(cfg.server.port).toBe(4000)
        expect(cfg.server.host).toBe('127.0.0.1')
        expect(cfg.rpc.enabled).toBe(false)
        expect(cfg.css.main).toBe('styles/custom.css')
        expect(cfg.build.outDir).toBe('build')
    })

    it('rpc: false — enabled: false, describe: false', async () => {
        const dir = await makeProjectDir('rpc-off')
        await writeFile(join(dir, 'tusten.config.ts'), `export default { rpc: false }\n`)
        const cfg = await loadConfig(dir)
        expect(cfg.rpc.enabled).toBe(false)
        expect(cfg.rpc.describe).toBe(false)
    })

    it('rpc: {} — enabled по умолчанию true', async () => {
        const dir = await makeProjectDir('rpc-empty')
        await writeFile(join(dir, 'tusten.config.ts'), `export default { rpc: {} }\n`)
        const cfg = await loadConfig(dir)
        expect(cfg.rpc.enabled).toBe(true)
        expect(cfg.rpc.url).toBe('/service')
        expect(cfg.rpc.describe).toBe(true)
    })

    it('rpc.extendContext сохраняется', async () => {
        const dir = await makeProjectDir('rpc-ext')
        await writeFile(
            join(dir, 'tusten.config.ts'),
            `export default {
        rpc: {
          extendContext: async (req) => ({ headers: req.headers }),
        },
      }\n`,
        )
        const cfg = await loadConfig(dir)
        expect(typeof cfg.rpc.extendContext).toBe('function')
    })

    it('tusten.config.js — тоже работает', async () => {
        const dir = await makeProjectDir('js-config')
        await writeFile(join(dir, 'tusten.config.js'), `export default { ssr: false }\n`)
        const cfg = await loadConfig(dir)
        expect(cfg.ssr).toBe(false)
    })

    it('default — не объект → TustenError', async () => {
        const dir = await makeProjectDir('bad-config')
        await writeFile(join(dir, 'tusten.config.ts'), `export default null\n`)
        await expect(loadConfig(dir)).rejects.toThrow(/must export a default object/)
    })

    it('компоненты error/loading/notFound', async () => {
        const dir = await makeProjectDir('components')
        await writeFile(
            join(dir, 'tusten.config.ts'),
            `export default {
        components: {
          error: 'shared/Error:Err',
          loading: 'shared/Loading:Load',
          notFound: 'shared/NotFound:NF',
        },
      }\n`,
        )
        const cfg = await loadConfig(dir)
        expect(cfg.components.error).toBe('shared/Error:Err')
        expect(cfg.components.loading).toBe('shared/Loading:Load')
        expect(cfg.components.notFound).toBe('shared/NotFound:NF')
    })

    it('runtimeConfig.public', async () => {
        const dir = await makeProjectDir('runtime')
        await writeFile(
            join(dir, 'tusten.config.ts'),
            `export default {
        runtimeConfig: { public: { apiUrl: 'https://api.example.com' } },
      }\n`,
        )
        const cfg = await loadConfig(dir)
        expect(cfg.runtimeConfig.public).toEqual({
            apiUrl: 'https://api.example.com',
        })
    })
})
