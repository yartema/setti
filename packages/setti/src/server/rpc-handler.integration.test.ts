import { describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { createRpcHandler } from './rpc-handler'
import { RpcRegistry } from './rpc-registry'
import type { ResolvedSettiConfig, RpcMethodDefinition } from '../types'

/**
 * Минимальный `ResolvedSettiConfig` для тестов.
 *
 * @param overrides переопределения.
 * @returns конфиг.
 */
function makeConfig(overrides: Partial<ResolvedSettiConfig> = {}): ResolvedSettiConfig {
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
    } as ResolvedSettiConfig
}

/**
 * Создаёт Fastify с зарегистрированным RPC-endpoint.
 *
 * @param methods методы объекта `Users`.
 * @param config конфиг (по умолчанию — минимальный).
 * @returns Fastify-инстанс.
 */
function makeApp(
    methods: Record<string, RpcMethodDefinition<unknown, unknown>> = {
        Ping: { handler: async () => 'pong' },
    },
    config: ResolvedSettiConfig = makeConfig(),
): FastifyInstance {
    const app = Fastify({ logger: false })
    const registry = new RpcRegistry()
    registry.add({ name: 'Users', methods })
    app.post(config.rpc.url, createRpcHandler({ registry, config }))
    return app
}

describe('POST /service — интеграция (fastify.inject)', () => {
    it('одиночный запрос — 200, JSON-RPC ответ', async () => {
        const app = makeApp()
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: { jsonrpc: '2.0', method: 'Users.Ping', id: 1 },
        })
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toMatch(/application\/json/)
        expect(res.json()).toEqual({ jsonrpc: '2.0', result: 'pong', id: 1 })
    })

    it('batch — массив ответов', async () => {
        const app = makeApp({
            Ping: { handler: async () => 'pong' },
            Hi: { handler: async () => 'hi' },
        })
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: [
                { jsonrpc: '2.0', method: 'Users.Ping', id: 1 },
                { jsonrpc: '2.0', method: 'Users.Hi', id: 2 },
            ],
        })
        expect(res.statusCode).toBe(200)
        const body = res.json() as Array<{ id: number; result: string }>
        expect(body).toHaveLength(2)
        expect(body[0].id).toBe(1)
        expect(body[0].result).toBe('pong')
        expect(body[1].id).toBe(2)
        expect(body[1].result).toBe('hi')
    })

    it('X-Request-Id эхом возвращается', async () => {
        const app = makeApp()
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            headers: { 'x-request-id': 'my-trace-123' },
            payload: { jsonrpc: '2.0', method: 'Users.Ping', id: 1 },
        })
        expect(res.headers['x-request-id']).toBe('my-trace-123')
    })

    it('X-Request-Id генерируется, если не передан', async () => {
        const app = makeApp()
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: { jsonrpc: '2.0', method: 'Users.Ping', id: 1 },
        })
        expect(res.headers['x-request-id']).toBeDefined()
        expect(typeof res.headers['x-request-id']).toBe('string')
    })

    it('extendContext вызывается, результат мержится в ctx', async () => {
        const extendContext = vi.fn(async () => ({ user: { id: 42 } }))
        const config = makeConfig({
            rpc: { enabled: true, url: '/service', describe: true, extendContext },
        })
        const app = makeApp({ Who: { handler: async (_p, ctx) => ({ user: ctx.user }) } }, config)
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: { jsonrpc: '2.0', method: 'Users.Who', id: 1 },
        })
        expect(extendContext).toHaveBeenCalledTimes(1)
        expect(res.json().result).toEqual({ user: { id: 42 } })
    })

    it('extendContext бросает — 200, extension пустой', async () => {
        const extendContext = vi.fn(async () => {
            throw new Error('boom')
        })
        const config = makeConfig({
            rpc: { enabled: true, url: '/service', describe: true, extendContext },
        })
        const app = makeApp({ Who: { handler: async (_p, ctx) => ({ user: ctx.user ?? null }) } }, config)
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: { jsonrpc: '2.0', method: 'Users.Who', id: 1 },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().result).toEqual({ user: null })
    })

    it('method not found — 200, error -32601', async () => {
        const app = makeApp()
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: { jsonrpc: '2.0', method: 'Users.Ghost', id: 1 },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().error.code).toBe(-32601)
    })

    it('System.Describe — встроенный метод, не требует регистрации', async () => {
        const app = makeApp()
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: { jsonrpc: '2.0', method: 'System.Describe', id: 1 },
        })
        expect(res.statusCode).toBe(200)
        const body = res.json() as {
            result: { objects: Array<{ name: string }> }
        }
        expect(body.result.objects).toBeDefined()
        expect(body.result.objects.length).toBeGreaterThan(0)
        expect(body.result.objects[0].name).toBe('Users')
    })

    it('кастомный url из config.rpc.url', async () => {
        const config = makeConfig({
            rpc: { enabled: true, url: '/rpc', describe: true },
        })
        const app = makeApp({ Ping: { handler: async () => 'pong' } }, config)
        const res = await app.inject({
            method: 'POST',
            url: '/rpc',
            payload: { jsonrpc: '2.0', method: 'Users.Ping', id: 1 },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().result).toBe('pong')
    })

    it('content-type: application/json в ответе', async () => {
        const app = makeApp()
        const res = await app.inject({
            method: 'POST',
            url: '/service',
            payload: { jsonrpc: '2.0', method: 'Users.Ping', id: 1 },
        })
        expect(res.headers['content-type']).toMatch(/application\/json/)
    })
})
