import { describe, expect, it } from 'vitest'
import { buildRouteTree } from './route-tree'
import type { MiddlewareDef, ResolvedTustenConfig, TustenRoute } from './types'

/**
 * Минимальный `ResolvedTustenConfig` для тестов.
 *
 * Поля, которые не важны для `buildRouteTree`, заполнены дефолтами.
 * Если `ResolvedTustenConfig` расширится — добавьте поля сюда.
 *
 * @param overrides переопределения.
 * @returns конфиг.
 */
function makeConfig(overrides: Partial<ResolvedTustenConfig> = {}): ResolvedTustenConfig {
    return {
        ssr: true,
        clientDir: 'client',
        serverDir: 'server',
        layouts: { main: './layouts/Main.tsx' },
        components: { error: null, loading: null, notFound: null },
        server: { port: 3000, host: '0.0.0.0', routes: null, plugins: null },
        fastify: {},
        rpc: { enabled: true, url: '/service', describe: true },
        middleware: [],
        css: { main: 'styles/main.css' },
        vite: {},
        build: { outDir: 'dist' },
        ...overrides,
    } as ResolvedTustenConfig
}

/**
 * Фабрика маршрута с дефолтами.
 *
 * @param partial обязательные поля + override.
 * @returns полный `TustenRoute`.
 */
function makeRoute(partial: Partial<TustenRoute> & { id: string; type: string }): TustenRoute {
    return {
        contentConfig: {
            workspaceConfig: { template: `${partial.id}/view:View` },
            prefetchConfig: { configLoader: `${partial.id}/Factories/Root` },
        },
        ...partial,
    }
}

/**
 * Обёртка `buildRouteTree` — принимает массив маршрутов и config.
 *
 * @param routes маршруты.
 * @param config конфиг (по умолчанию — минимальный).
 * @param loaderModules global loaders (для A3).
 * @returns дерево.
 */
function build(
    routes: TustenRoute[],
    config: ResolvedTustenConfig = makeConfig(),
    loaderModules: Array<{ file: string; map: Record<string, unknown> }> = [],
) {
    return buildRouteTree([{ file: 'test/router.ts', routes }], loaderModules, config)
}

describe('buildRouteTree', () => {
    describe('базовые случаи', () => {
        it('пустой массив маршрутов — пустое дерево', () => {
            const tree = build([])
            expect(tree.byId.size).toBe(0)
            expect(tree.paths.size).toBe(0)
            expect(tree.indexRouteId).toBeNull()
            expect(tree.compiled).toEqual([])
        })

        it('один index-маршрут', () => {
            const route = makeRoute({ id: 'home', type: 'main', index: true })
            const tree = build([route])
            expect(tree.byId.size).toBe(1)
            expect(tree.indexRouteId).toBe('home')
            expect(tree.paths.get('home')).toBe('/')
        })

        it('статический маршрут', () => {
            const route = makeRoute({ id: 'about', type: 'main' })
            const tree = build([route])
            expect(tree.paths.get('about')).toBe('/about')
        })

        it('вложенный по parentId', () => {
            const parent = makeRoute({ id: 'admin', type: 'main' })
            const child = makeRoute({ id: 'users', type: 'main', parentId: 'admin' })
            const tree = build([parent, child])
            expect(tree.paths.get('users')).toBe('/admin/users')
        })
    })

    describe('валидация: id', () => {
        it('бросает на дубле id', () => {
            const a = makeRoute({ id: 'x', type: 'main' })
            const b = makeRoute({ id: 'x', type: 'main' })
            expect(() => build([a, b])).toThrow(/Duplicate route id "x"/)
        })
    })

    describe('валидация: parentId', () => {
        it('бросает на неизвестный parentId', () => {
            const route = makeRoute({ id: 'x', type: 'main', parentId: 'ghost' })
            expect(() => build([route])).toThrow(/references unknown parentId "ghost"/)
        })

        it('бросает на цикл из 2 маршрутов', () => {
            const a = makeRoute({ id: 'a', type: 'main', parentId: 'b' })
            const b = makeRoute({ id: 'b', type: 'main', parentId: 'a' })
            expect(() => build([a, b])).toThrow(/Cycle detected/)
        })

        it('бросает на цикл из 3 маршрутов', () => {
            const a = makeRoute({ id: 'a', type: 'main', parentId: 'c' })
            const b = makeRoute({ id: 'b', type: 'main', parentId: 'a' })
            const c = makeRoute({ id: 'c', type: 'main', parentId: 'b' })
            expect(() => build([a, b, c])).toThrow(/Cycle detected/)
        })
    })

    describe('валидация: index', () => {
        it('бросает на несколько index', () => {
            const a = makeRoute({ id: 'a', type: 'main', index: true })
            const b = makeRoute({ id: 'b', type: 'main', index: true })
            expect(() => build([a, b])).toThrow(/Multiple index routes/)
        })
    })

    describe('валидация: type', () => {
        it('бросает на неизвестный type', () => {
            const route = makeRoute({ id: 'x', type: 'unknown' })
            expect(() => build([route])).toThrow(/unknown layout type "unknown"/)
        })
    })

    describe('валидация: ssr + index', () => {
        it('бросает на index + ssr: false', () => {
            const route = makeRoute({
                id: 'home',
                type: 'main',
                index: true,
                ssr: false,
            })
            expect(() => build([route])).toThrow(/"index: true" cannot have "ssr: false"/)
        })
    })

    describe('валидация: path + slug', () => {
        it('бросает на path + slug одновременно', () => {
            const route = makeRoute({
                id: 'x',
                type: 'main',
                path: '/x',
                slug: ['y'],
            })
            expect(() => build([route])).toThrow(/cannot have both "path" and "slug"/)
        })
    })

    describe('валидация: URL-коллизии', () => {
        it('бросает на дубль URL-паттерна', () => {
            const a = makeRoute({ id: 'a', type: 'main', path: '/same' })
            const b = makeRoute({ id: 'b', type: 'main', path: '/same' })
            expect(() => build([a, b])).toThrow(/Duplicate URL pattern/)
        })

        it('бросает на regex-коллизию', () => {
            const a = makeRoute({ id: 'a', type: 'main', path: '/:id' })
            const b = makeRoute({ id: 'b', type: 'main', path: '/:slug' })
            // Оба ^/([^/]+)$ — та же regex, но разные имена параметров
            expect(() => build([a, b])).toThrow(/Ambiguous URL regex/)
        })
    })

    describe('layoutChains', () => {
        it('одиночный layout', () => {
            const route = makeRoute({ id: 'home', type: 'main', index: true })
            const tree = build([route])
            expect(tree.layoutChains.get('home')).toEqual(['main'])
        })

        it('вложенный layout: main → admin', () => {
            const config = makeConfig({
                layouts: {
                    main: './layouts/Main.tsx',
                    admin: './layouts/Admin.tsx',
                },
            })
            const parent = makeRoute({ id: 'home', type: 'main', index: true })
            const child = makeRoute({
                id: 'admin',
                type: 'admin',
                parentId: 'home',
            })
            const tree = build([parent, child], config)
            expect(tree.layoutChains.get('home')).toEqual(['main'])
            expect(tree.layoutChains.get('admin')).toEqual(['main', 'admin'])
        })

        it('трёхуровневая цепочка', () => {
            const config = makeConfig({
                layouts: {
                    main: './l/Main',
                    admin: './l/Admin',
                    panel: './l/Panel',
                },
            })
            const root = makeRoute({ id: 'root', type: 'main', index: true })
            const mid = makeRoute({ id: 'admin', type: 'admin', parentId: 'root' })
            const leaf = makeRoute({ id: 'users', type: 'panel', parentId: 'admin' })
            const tree = build([root, mid, leaf], config)
            expect(tree.layoutChains.get('users')).toEqual(['main', 'admin', 'panel'])
        })
    })

    describe('compiled', () => {
        it('компилирует статический маршрут', () => {
            const route = makeRoute({ id: 'home', type: 'main', index: true })
            const tree = build([route])
            expect(tree.compiled).toEqual([{ id: 'home', path: '/', regexSource: '^/$', paramNames: [] }])
        })

        it('компилирует slug-паттерн', () => {
            const route = makeRoute({
                id: 'blog',
                type: 'main',
                slug: ['/regex:[a-z]+'],
            })
            const tree = build([route])
            expect(tree.compiled[0].regexSource).toBe('^/blog/([a-z]+)$')
            expect(tree.compiled[0].paramNames).toEqual(['slug'])
        })
    })

    describe('middleware inheritance', () => {
        const authMw: MiddlewareDef = {
            id: 'auth',
            handler: 'client/middleware/auth',
        }
        const loggerMw: MiddlewareDef = {
            id: 'logger',
            handler: 'shared/middleware/logger',
            side: 'both',
        }

        it('родитель без middleware — у ребёнка пусто', () => {
            const parent = makeRoute({ id: 'home', type: 'main', index: true })
            const child = makeRoute({ id: 'admin', type: 'main', parentId: 'home' })
            const tree = build([parent, child])
            expect(tree.byId.get('home')?.middleware).toEqual([])
            expect(tree.byId.get('admin')?.middleware).toEqual([])
        })

        it('middleware родителя наследуется ребёнком', () => {
            const parent = makeRoute({
                id: 'home',
                type: 'main',
                index: true,
                middleware: [authMw],
            })
            const child = makeRoute({ id: 'admin', type: 'main', parentId: 'home' })
            const tree = build([parent, child])
            expect(tree.byId.get('home')?.middleware).toEqual([authMw])
            expect(tree.byId.get('admin')?.middleware).toEqual([authMw])
        })

        it('локальные middleware добавляются к наследованным', () => {
            const parent = makeRoute({
                id: 'home',
                type: 'main',
                index: true,
                middleware: [authMw],
            })
            const child = makeRoute({
                id: 'admin',
                type: 'main',
                parentId: 'home',
                middleware: [loggerMw],
            })
            const tree = build([parent, child])
            expect(tree.byId.get('admin')?.middleware).toEqual([authMw, loggerMw])
        })

        it('пустой массив отключает наследование', () => {
            const parent = makeRoute({
                id: 'home',
                type: 'main',
                index: true,
                middleware: [authMw],
            })
            const child = makeRoute({
                id: 'admin',
                type: 'main',
                parentId: 'home',
                middleware: [],
            })
            const tree = build([parent, child])
            expect(tree.byId.get('admin')?.middleware).toEqual([])
        })

        it('трёхуровневое наследование', () => {
            const root = makeRoute({
                id: 'root',
                type: 'main',
                index: true,
                middleware: [authMw],
            })
            const mid = makeRoute({
                id: 'mid',
                type: 'main',
                parentId: 'root',
                middleware: [loggerMw],
            })
            const leaf = makeRoute({
                id: 'leaf',
                type: 'main',
                parentId: 'mid',
            })
            const tree = build([root, mid, leaf])
            expect(tree.byId.get('leaf')?.middleware).toEqual([authMw, loggerMw])
        })
    })

    describe('A3 — коллизии global vs page', () => {
        it('бросает на дубли global loader-имени', () => {
            const loaderModules = [
                {
                    file: 'client/A.loader.ts',
                    map: { userInfo: { dataFactoryName: 'a:x' } },
                },
                {
                    file: 'client/B.loader.ts',
                    map: { userInfo: { dataFactoryName: 'b:y' } },
                },
            ]
            const route = makeRoute({ id: 'home', type: 'main', index: true })
            expect(() => buildRouteTree([{ file: 'r.ts', routes: [route] }], loaderModules, makeConfig())).toThrow(
                /Global loader "userInfo" is declared in both/,
            )
        })

        it('разные имена — ок', () => {
            const loaderModules = [
                {
                    file: 'client/A.loader.ts',
                    map: { userInfo: { dataFactoryName: 'a:x' } },
                },
                {
                    file: 'client/B.loader.ts',
                    map: { permissions: { dataFactoryName: 'b:y' } },
                },
            ]
            const route = makeRoute({ id: 'home', type: 'main', index: true })
            expect(() => buildRouteTree([{ file: 'r.ts', routes: [route] }], loaderModules, makeConfig())).not.toThrow()
        })
    })
})
