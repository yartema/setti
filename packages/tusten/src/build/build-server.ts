import type { FactoryMap, ResolvedTustenConfig, RouteTree } from '../types';
import { tustenPlugin } from '../vite/plugin'

/** Опции SSR build. */
export interface BuildServerOptions {
    projectDir: string
    clientDir: string
    config: ResolvedTustenConfig
    routeTree: RouteTree
    outDir: string
    /** Спеки factory-модулей для включения в SSR-бандл. */
    factoryModules: string[]
    /** Глобальный реестр фабрик (`*.loader.ts`). */
    globalRegistry: FactoryMap
}

/**
 * Собирает SSR-бандл в `outDir`.
 *
 * @param options опции.
 */
export async function buildServer(options: BuildServerOptions): Promise<void> {
    const { projectDir, clientDir, config, routeTree, outDir, factoryModules, globalRegistry } =
        options
    const { build } = await import('vite')
    const react = (await import('@vitejs/plugin-react')).default
    const userVite = config.vite ?? {}

    await build({
        ...userVite,
        root: projectDir,
        configFile: false,
        appType: 'custom',
        plugins: [
            tustenPlugin({ projectDir, clientDir, config, routeTree, factoryModules, globalFactories: globalRegistry }),
            react(),
            ...(userVite.plugins ?? []),
        ],
        resolve: { ...(userVite.resolve ?? {}), preserveSymlinks: false },
        ssr: {
            ...(userVite.ssr ?? {}),
            external: ['react', 'react-dom', 'react/jsx-runtime'],
        },
        build: {
            ...(userVite.build ?? {}),
            outDir,
            emptyOutDir: true,
            ssr: true,
            rollupOptions: {
                input: 'virtual:tusten/ssr-entry',
                external: ['react', 'react-dom', 'react/jsx-runtime'],
                output: {
                    entryFileNames: 'entry.js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    format: 'esm',
                },
            },
        },
    })
}