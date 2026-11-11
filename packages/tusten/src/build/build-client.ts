import type { UserConfig } from 'vite'
import type { FactoryMap, ResolvedTustenConfig, RouteTree } from '../types';
import { tustenPlugin } from '../vite/plugin'
import { resolveCssMainPath } from '../utils/css'

/** Опции клиентского build. */
export interface BuildClientOptions {
    projectDir: string
    clientDir: string
    config: ResolvedTustenConfig
    routeTree: RouteTree
    outDir: string
    factoryModules: string[]
    /** Глобальный реестр фабрик (`*.loader.ts`). */
    globalRegistry: FactoryMap
}

/**
 * Собирает клиентский бандл в `outDir`.
 *
 * @param options опции.
 */
export async function buildClient(options: BuildClientOptions): Promise<void> {
    const { projectDir, clientDir, config, routeTree, outDir, factoryModules, globalRegistry } =
        options
    const { build } = await import('vite')
    const react = (await import('@vitejs/plugin-react')).default
    const userVite = (config.vite ?? {}) as UserConfig
    const cssMainPath = resolveCssMainPath(projectDir, clientDir, config)

    await build({
        ...userVite,
        root: projectDir,
        configFile: false,
        appType: 'custom',
        plugins: [
            tustenPlugin({
                projectDir,
                clientDir,
                config,
                routeTree,
                factoryModules,
                globalFactories: globalRegistry,
                cssMain: cssMainPath,
            }),
            react(),
            ...((userVite.plugins as import('vite').Plugin[]) ?? []),
        ],
        resolve: { ...(userVite.resolve ?? {}), preserveSymlinks: false },
        build: {
            ...(userVite.build ?? {}),
            outDir,
            emptyOutDir: true,
            manifest: true,
            rollupOptions: {
                input: 'virtual:tusten/client-entry',
                output: {
                    entryFileNames: 'client.js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash][extname]',
                },
            },
        },
    })
}