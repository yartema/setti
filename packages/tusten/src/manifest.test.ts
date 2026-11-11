import { describe, expect, it } from 'vitest'
import { buildManifest } from './manifest'
import type { ResolvedTustenConfig, TustenRoute, ScanResult } from './types'

/**
 * Минимальный `ResolvedTustenConfig` для тестов.
 *
 * @param overrides переопределения.
 * @returns конфиг.
 */
function makeConfig(overrides: Partial<ResolvedTustenConfig> = {}): ResolvedTustenConfig {
    return {
        ssr: true,
        clientDir: 'client',
        serverDir: 'server',
        layouts: {},
        components: { error: null, loading: null, notFound: null },
        server: { port: 3000, host: '0.0.0.0', routes: null, plugins: null },
        fastify: {},
        rpc: { enabled: true, url: '/service', describe: true },
        middleware: [],
        css: { main: '' },
        vite: {},
        build: { outDir: 'dist' },
        ...overrides,
    } as ResolvedTustenConfig
}

/**
 * Фабрика маршрута.
 *
 * @param partial обязательные + override.
 * @returns маршрут.
 */
function makeRoute(partial: Partial<TustenRoute> & { id: string; type: string }): TustenRoute {
    return {
        title: partial.id,
        contentConfig: {
            workspaceConfig: { template: `${partial.id}/view:View` },
            prefetchConfig: { configLoader: `${partial.id}/Factories/Root` },
        },
        ...partial,
    }
}

/**
 * Фабрика `ScanResult` с дефолтами.
 *
 * @param overrides переопределения.
 * @returns scan.
 */
function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
    return {
        routeModules: [],
        loaderModules: [],
        ...overrides,
    }
}

describe('buildManifest', () => {
    it('пустой scan — пустой modules, но version есть', () => {
        const m = buildManifest(makeScan(), makeConfig(), '/proj/client')
        expect(m.version).toBeDefined()
        expect(m.version.length).toBeGreaterThan(0)
        expect(m.modules).toEqual({})
    })

    it('router.ts → kind: routes', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/HomePage/router.ts',
                        routes: [makeRoute({ id: 'home', type: 'main' })],
                    },
                ],
            }),
            makeConfig({ layouts: { main: './l/Main.tsx' } }),
            '/proj/client',
        )
        expect(m.modules['HomePage/router']).toEqual({
            kind: 'routes',
            js: 'HomePage/router',
            css: [],
        })
    })

    it('*.loader.ts → kind: globalLoader', () => {
        const m = buildManifest(
            makeScan({
                loaderModules: [
                    {
                        file: '/proj/client/User.loader.ts',
                        map: { userInfo: { dataFactoryName: 'x:y' } },
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['User.loader']?.kind).toBe('globalLoader')
    })

    it('layouts из config → kind: layout', () => {
        const m = buildManifest(
            makeScan(),
            makeConfig({
                layouts: {
                    main: './layouts/Main.tsx',
                    admin: './layouts/Admin.tsx',
                },
            }),
            '/proj/client',
        )
        expect(m.modules['layouts/Main']?.kind).toBe('layout')
        expect(m.modules['layouts/Admin']?.kind).toBe('layout')
    })

    it('template из route → kind: component', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/X/router.ts',
                        routes: [
                            makeRoute({
                                id: 'x',
                                type: 'main',
                                contentConfig: {
                                    workspaceConfig: { template: 'X/view:View' },
                                    prefetchConfig: { configLoader: 'X/Factories/Root' },
                                },
                            }),
                        ],
                    },
                ],
            }),
            makeConfig({ layouts: { main: './l' } }),
            '/proj/client',
        )
        expect(m.modules['X/view']?.kind).toBe('component')
    })

    it('configLoader из route → kind: config', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/X/router.ts',
                        routes: [
                            makeRoute({
                                id: 'x',
                                type: 'main',
                                contentConfig: {
                                    workspaceConfig: { template: 'X/view:View' },
                                    prefetchConfig: { configLoader: 'X/Factories/Root' },
                                },
                            }),
                        ],
                    },
                ],
            }),
            makeConfig({ layouts: { main: './l' } }),
            '/proj/client',
        )
        expect(m.modules['X/Factories/Root']?.kind).toBe('config')
    })

    it('version детерминированная — одинаковые модули → одинаковый hash', () => {
        const scan = makeScan({
            routeModules: [
                {
                    file: '/proj/client/A/router.ts',
                    routes: [makeRoute({ id: 'a', type: 'main' })],
                },
            ],
        })
        const config = makeConfig({ layouts: { main: './l' } })
        const m1 = buildManifest(scan, config, '/proj/client')
        const m2 = buildManifest(scan, config, '/proj/client')
        expect(m1.version).toBe(m2.version)
    })

    it('version разная — разные модули → разный hash', () => {
        const m1 = buildManifest(makeScan(), makeConfig(), '/proj/client')
        const m2 = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/A/router.ts',
                        routes: [makeRoute({ id: 'a', type: 'main' })],
                    },
                ],
            }),
            makeConfig({ layouts: { main: './l' } }),
            '/proj/client',
        )
        expect(m1.version).not.toBe(m2.version)
    })

    it('спека с :export — в манифесте без суффикса', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/A/router.ts',
                        routes: [
                            makeRoute({
                                id: 'a',
                                type: 'main',
                                contentConfig: {
                                    workspaceConfig: { template: 'A/view:View' },
                                    prefetchConfig: { configLoader: 'A/Root:getConfig' },
                                },
                            }),
                        ],
                    },
                ],
            }),
            makeConfig({ layouts: { main: './l' } }),
            '/proj/client',
        )
        expect(m.modules['A/view']).toBeDefined()
        expect(m.modules['A/view:View']).toBeUndefined()
        expect(m.modules['A/Root']).toBeDefined()
        expect(m.modules['A/Root:getConfig']).toBeUndefined()
    })
})
