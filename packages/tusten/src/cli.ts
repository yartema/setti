#!/usr/bin/env node
// CLI фреймворка tusten.

import path from 'node:path'
import { loadConfig } from './config'
import { scan } from './scanner'
import { buildRouteTree } from './route-tree'
import { buildManifest } from './manifest'
import { __initResolver } from './resolver'
import { collectFactoryModules } from './build/collect-factories'
import type { FactoryMap } from './types'
import { TustenError } from './errors'
import { scanRpcObjects } from './server/rpc-scanner'
import { RpcRegistry } from './server/rpc-registry'

/**
 * Общая подготовка: конфиг + скан + дерево + манифест + globalRegistry
 * + factoryModules.
 *
 * @param cwd текущая директория.
 * @returns подготовленный контекст.
 */
async function prepare(cwd: string) {
    const config = await loadConfig(cwd)
    const clientDir = path.resolve(cwd, config.clientDir)
    const scanResult = await scan(clientDir)
    const routeTree = buildRouteTree(scanResult.routeModules, scanResult.loaderModules, config)
    const manifest = buildManifest(scanResult, config, clientDir)
    __initResolver({ clientDir })

    const globalRegistry: FactoryMap = {}
    const sources = new Map<string, string>()
    for (const { file, map } of scanResult.loaderModules) {
        for (const [name, def] of Object.entries(map)) {
            const existing = sources.get(name)
            if (existing) {
                throw new TustenError(`Global loader "${name}" declared in both "${existing}" and "${file}" (A3)`)
            }
            globalRegistry[name] = def
            sources.set(name, file)
        }
    }

    const factoryModules = await collectFactoryModules(cwd, routeTree, scanResult, clientDir)

    // RPC-реестр (если RPC включён).
    const serverDir = path.resolve(cwd, config.serverDir)
    let rpcRegistry: RpcRegistry | null = null
    if (config.rpc.enabled) {
        const rpcObjects = await scanRpcObjects(serverDir)
        rpcRegistry = new RpcRegistry()
        for (const obj of rpcObjects) rpcRegistry.add(obj)
    }

    return {
        config,
        clientDir,
        scanResult,
        routeTree,
        manifest,
        globalRegistry,
        factoryModules,
        rpcRegistry,
    }
}

/** Команда `tusten inspect`. */
async function inspect(): Promise<void> {
    const cwd = process.cwd()
    const { routeTree, manifest, rpcRegistry } = await prepare(cwd)

    console.log('Routes:')
    if (routeTree.byId.size === 0) {
        console.log('  (no routes found)')
    } else {
        for (const [id, routePath] of routeTree.paths) {
            const marker = id === routeTree.indexRouteId ? ' [index]' : ''
            console.log(`  ${routePath.padEnd(30)} (${id})${marker}`)
        }
    }

    console.log('\nRPC methods:')
    if (!rpcRegistry || rpcRegistry.size === 0) {
        console.log('  (none)')
    } else {
        for (const name of rpcRegistry.listMethods()) {
            const m = rpcRegistry.getMethod(name)!
            const desc = m.method.description ? `  // ${m.method.description}` : ''
            const internal = m.method.internal ? ' [internal]' : ''
            console.log(`  ${name}${internal}${desc}`)
        }
    }
    console.log('\nManifest:')
    console.log(JSON.stringify(manifest, null, 2))
}

/** Команда `tusten dev`. */
async function dev(): Promise<void> {
    const cwd = process.cwd()
    const prepared = await prepare(cwd)
    const { createServer } = await import('./server/create-server')
    const server = await createServer({
        config: prepared.config,
        projectDir: cwd,
        routeTree: prepared.routeTree,
        manifest: prepared.manifest,
        globalRegistry: prepared.globalRegistry,
        factoryModules: prepared.factoryModules,
        rpcRegistry: prepared.rpcRegistry,
        mode: 'development',
    })
    await server.listen({
        port: prepared.config.server.port,
        host: prepared.config.server.host,
    })
    console.log(`\ntusten dev: http://${prepared.config.server.host}:${prepared.config.server.port}\n`)
}

/** Команда `tusten build`. */
async function buildCmd(): Promise<void> {
    const cwd = process.cwd()
    const prepared = await prepare(cwd)
    const { buildProject } = await import('./build/build')
    await buildProject({
        projectDir: cwd,
        config: prepared.config,
        routeTree: prepared.routeTree,
        scanResult: prepared.scanResult,
        factoryModules: prepared.factoryModules,
        globalRegistry: prepared.globalRegistry,
    })
    console.log(`\ntusten build: done (outDir=${prepared.config.build.outDir})\n`)
}

/** Команда `tusten start`. */
async function start(): Promise<void> {
    const cwd = process.cwd()
    const prepared = await prepare(cwd)
    const { createServer } = await import('./server/create-server')
    const server = await createServer({
        config: prepared.config,
        projectDir: cwd,
        routeTree: prepared.routeTree,
        manifest: prepared.manifest,
        globalRegistry: prepared.globalRegistry,
        factoryModules: prepared.factoryModules,
        rpcRegistry: prepared.rpcRegistry,
        mode: 'production',
    })
    await server.listen({
        port: prepared.config.server.port,
        host: prepared.config.server.host,
    })
    console.log(`\ntusten start: http://${prepared.config.server.host}:${prepared.config.server.port}\n`)
}

/** Точка входа CLI. */
async function main(): Promise<void> {
    const command = process.argv[2] ?? 'help'
    switch (command) {
        case 'inspect':
            await inspect()
            break
        case 'dev':
            await dev()
            break
        case 'build':
            await buildCmd()
            break
        case 'start':
            await start()
            break
        case 'help':
        default:
            console.log(`tusten <command>

Commands:
  dev       Start dev server (Fastify + Vite)
  build     Build for production (client + server)
  start     Start production server
  inspect   Dump routes and manifest
`)
            break
    }
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
