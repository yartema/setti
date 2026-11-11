import { describe, expect, it, vi } from 'vitest'
import { resolveMeta } from './meta-resolver'
import type { TustenRoute, TustenRouter } from '../types'

function makeRoute(metaConfig: TustenRoute['metaConfig']): TustenRoute {
    return {
        id: 'home',
        type: 'main',
        metaConfig,
        contentConfig: {
            workspaceConfig: { template: 'x' },
            prefetchConfig: { configLoader: 'x' },
        },
    }
}

const router: TustenRouter = { id: 'home', path: '/', params: {}, query: {}, request: null }

describe('resolveMeta', () => {
    it('fallback title — Страница', async () => {
        const m = await resolveMeta(makeRoute(undefined), router, 'http://x/', async () => null)
        expect(m.title).toBe('Страница')
        expect(m.meta).toEqual([])
        expect(m.microdata).toEqual({})
    })

    it('статический title', async () => {
        const m = await resolveMeta(makeRoute({ title: 'Custom' }), router, 'http://x/', async () => null)
        expect(m.title).toBe('Custom')
    })

    it('статические meta + microdata', async () => {
        const m = await resolveMeta(
            makeRoute({
                meta: [{ name: 'description', content: 'X' }],
                microdata: { '@type': 'A' },
            }),
            router,
            'http://x/',
            async () => null,
        )
        expect(m.meta).toEqual([{ name: 'description', content: 'X' }])
        expect(m.microdata).toEqual({ '@type': 'A' })
    })

    it('getMetaCallback — мерж со статикой', async () => {
        const fn = vi.fn(async () => ({
            meta: [{ name: 'og:title', content: 'FromFn', attribute: 'property' as const }],
            microdata: { extra: true },
        }))
        const loadModule = vi.fn(async () => fn)

        const m = await resolveMeta(
            makeRoute({
                title: 'T',
                meta: [{ name: 'description', content: 'Static' }],
                microdata: { '@type': 'A' },
                getMetaCallback: 'x:y',
            }),
            router,
            'http://x/',
            loadModule,
        )
        expect(fn).toHaveBeenCalled()
        expect(m.meta).toHaveLength(2) // static + fromFn
        expect(m.meta[0].name).toBe('description')
        expect(m.meta[1].name).toBe('og:title')
        expect(m.microdata).toEqual({ '@type': 'A', extra: true })
    })

    it('getMetaCallback ошибка — warn + статика', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const loadModule = vi.fn(async () => {
            throw new Error('boom')
        })
        const m = await resolveMeta(
            makeRoute({
                title: 'T',
                meta: [{ name: 'description', content: 'Static' }],
                getMetaCallback: 'x:y',
            }),
            router,
            'http://x/',
            loadModule,
        )
        expect(warn).toHaveBeenCalled()
        expect(m.meta).toEqual([{ name: 'description', content: 'Static' }])
    })

    it('title из метода переопределяет статический', async () => {
        const fn = vi.fn(async () => ({
            title: 'From Method',
            meta: [],
            microdata: {},
        }))
        const loadModule = vi.fn(async () => fn)

        const m = await resolveMeta(
            makeRoute({ title: 'Static', getMetaCallback: 'x:y' }),
            router,
            'http://x/',
            loadModule,
        )
        expect(m.title).toBe('From Method')
    })

    it('fallback на metaConfig.title если метод не вернул title', async () => {
        const fn = vi.fn(async () => ({
            meta: [{ name: 'description', content: 'X' }],
            microdata: {},
        }))
        const loadModule = vi.fn(async () => fn)

        const m = await resolveMeta(
            makeRoute({ title: 'Static', getMetaCallback: 'x:y' }),
            router,
            'http://x/',
            loadModule,
        )
        expect(m.title).toBe('Static')
    })
})
