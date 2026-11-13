import path from 'node:path'
import type { FactoryMap, ResolvedTustenConfig, RouteTree, ScanResult } from '../types';
import { buildClient } from './build-client'
import { buildServer } from './build-server'

/** Опции полного build. */
export interface BuildProjectOptions {
    projectDir: string
    config: ResolvedTustenConfig
    routeTree: RouteTree
    scanResult: ScanResult
    /** Спеки factory-модулей (из `collectFactoryModules`). */
    factoryModules: string[]
    /** Глобальный реестр фабрик (`*.loader.ts`). */
    globalRegistry: FactoryMap
}

/**
 * Полная сборка: client + server.
 *
 * @param options опции.
 */
export async function buildProject(options: BuildProjectOptions): Promise<void> {
    const { projectDir, config, routeTree, scanResult, factoryModules, globalRegistry } = options
    void scanResult
    const clientDir = path.resolve(projectDir, config.client.clientDir)
    const outDir = path.resolve(projectDir, config.build.outDir)
    const clientOut = path.join(outDir, 'client')
    const serverOut = path.join(outDir, 'server')

    await buildClient({
        projectDir,
        clientDir,
        config,
        routeTree,
        outDir: clientOut,
        factoryModules,
        globalRegistry
    })

    await buildServer({
        projectDir,
        clientDir,
        config,
        routeTree,
        outDir: serverOut,
        factoryModules,
        globalRegistry
    })
}