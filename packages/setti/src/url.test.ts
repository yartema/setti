import { describe, expect, it } from 'vitest'
import { compilePath, compileRoute, computePath, matchRoute } from './url'
import type { CompiledRoute, SettiRoute } from './types'

/**
 * Фабрика маршрута с дефолтами.
 *
 * @param partial обязательные поля + override.
 * @returns полный `SettiRoute`.
 */
function makeRoute(partial: Partial<SettiRoute> & { id: string }): SettiRoute {
    return {
        title: 'Test',
        type: 'main',
        contentConfig: {
            workspaceConfig: { template: 'x:y' },
            prefetchConfig: { configLoader: 'x:y' },
        },
        ...partial,
    }
}

describe('compilePath', () => {
    it('компилирует статический путь', () => {
        expect(compilePath('/blog')).toEqual({
            regexSource: '^/blog$',
            paramNames: [],
        })
    })

    it('компилирует один параметр', () => {
        expect(compilePath('/blog/:slug')).toEqual({
            regexSource: '^/blog/([^/]+)$',
            paramNames: ['slug'],
        })
    })

    it('компилирует несколько параметров', () => {
        expect(compilePath('/user/:id/post/:postId')).toEqual({
            regexSource: '^/user/([^/]+)/post/([^/]+)$',
            paramNames: ['id', 'postId'],
        })
    })

    it('корневой путь', () => {
        expect(compilePath('/')).toEqual({
            regexSource: '^/$',
            paramNames: [],
        })
    })

    it('бросает на пути без /', () => {
        expect(() => compilePath('blog/:slug')).toThrow(/must start with/)
    })

    it('бросает на невалидном имени параметра', () => {
        expect(() => compilePath('/blog/:1slug')).toThrow(/Invalid param name/)
    })

    it('экранирует regex-спецсимволы', () => {
        const { regexSource } = compilePath('/a.b')
        expect(regexSource).toBe('^/a\\.b$')
    })
})

describe('computePath', () => {
    it('использует path, если задан', () => {
        const route = makeRoute({ id: 'blog', path: '/blog/:slug' })
        const map = new Map([[route.id, route]])
        expect(computePath(route, map)).toBe('/blog/:slug')
    })

    it('строит из цепочки parentId → id', () => {
        const parent = makeRoute({ id: 'admin' })
        const child = makeRoute({ id: 'users', parentId: 'admin' })
        const map = new Map([
            [parent.id, parent],
            [child.id, child],
        ])
        expect(computePath(child, map)).toBe('/admin/users')
    })

    it('index-маршрут не добавляет свой id', () => {
        const route = makeRoute({ id: 'home', index: true })
        expect(computePath(route, new Map([[route.id, route]]))).toBe('/')
    })

    it('вложенный index не добавляет свой id', () => {
        const parent = makeRoute({ id: 'admin' })
        const index = makeRoute({ id: 'dashboard', parentId: 'admin', index: true })
        const map = new Map([
            [parent.id, parent],
            [index.id, index],
        ])
        expect(computePath(index, map)).toBe('/admin')
    })

    it('добавляет slug-сегменты', () => {
        const route = makeRoute({ id: 'blog', slug: [':slug'] })
        expect(computePath(route, new Map([[route.id, route]]))).toBe('/blog/:slug')
    })

    it('renders regex slug as :slug', () => {
        const route = makeRoute({ id: 'blog', slug: ['/regex:[a-z0-9-]+'] })
        expect(computePath(route, new Map([[route.id, route]]))).toBe('/blog/:slug')
    })

    it('рендерит литеральный slug', () => {
        const route = makeRoute({ id: 'posts', slug: ['list'] })
        expect(computePath(route, new Map([[route.id, route]]))).toBe('/posts/list')
    })
})

describe('compileRoute', () => {
    it('компилирует slug с regex', () => {
        const route = makeRoute({ id: 'blog', slug: ['/regex:[a-z0-9-]+'] })
        const result = compileRoute(route, new Map([[route.id, route]]))
        expect(result.regexSource).toBe('^/blog/([a-z0-9-]+)$')
        expect(result.paramNames).toEqual(['slug'])
    })

    it('компилирует несколько regex-сегментов', () => {
        const route = makeRoute({
            id: 'catalog',
            slug: ['/regex:[0-9]+', '/regex:[a-z]+'],
        })
        const result = compileRoute(route, new Map([[route.id, route]]))
        expect(result.regexSource).toBe('^/catalog/([0-9]+)/([a-z]+)$')
        expect(result.paramNames).toEqual(['slug', 'slug1'])
    })

    it('бросает на пустом regex', () => {
        const route = makeRoute({ id: 'x', slug: ['/regex:'] })
        expect(() => compileRoute(route, new Map([[route.id, route]]))).toThrow(/Empty regex/)
    })

    it('бросает на невалидном имени параметра', () => {
        const route = makeRoute({ id: 'x', slug: [':1bad'] })
        expect(() => compileRoute(route, new Map([[route.id, route]]))).toThrow(/Invalid param name/)
    })
})

describe('matchRoute', () => {
    const compiled: CompiledRoute[] = [
        { id: 'home', path: '/', regexSource: '^/$', paramNames: [] },
        {
            id: 'blog',
            path: '/blog/:slug',
            regexSource: '^/blog/([^/]+)$',
            paramNames: ['slug'],
        },
        {
            id: 'post-comments',
            path: '/blog/:slug/comments',
            regexSource: '^/blog/([^/]+)/comments$',
            paramNames: ['slug'],
        },
    ]

    it('матчит корень', () => {
        expect(matchRoute('/', compiled)).toEqual({
            routeId: 'home',
            params: {},
        })
    })

    it('матчит динамический маршрут', () => {
        expect(matchRoute('/blog/hello', compiled)).toEqual({
            routeId: 'blog',
            params: { slug: 'hello' },
        })
    })

    it('матчит вложенный сегмент', () => {
        expect(matchRoute('/blog/hello/comments', compiled)).toEqual({
            routeId: 'post-comments',
            params: { slug: 'hello' },
        })
    })

    it('возвращает null, если не найдено', () => {
        expect(matchRoute('/nope', compiled)).toBeNull()
    })

    it('декодирует URL-параметры', () => {
        expect(matchRoute('/blog/hello%20world', compiled)).toEqual({
            routeId: 'blog',
            params: { slug: 'hello world' },
        })
    })
})
