import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { registerServerRoutes } from './api-register'
import type { ServerRoute } from '../types'

/** Временный корень — создаётся в `beforeAll`, удаляется в `afterAll`. */
let tmpRoot: string

beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'setti-api-'))

    // handler-модули
    await mkdir(join(tmpRoot, 'server/api/handlers'), { recursive: true })
    await writeFile(
        join(tmpRoot, 'server/api/handlers/ping.ts'),
        'export async function ping(_params, ctx) {\n' +
            '  return { ok: true, method: ctx.request.method }\n' +
            '}\n' +
            'export async function echo(_params, ctx) {\n' +
            '  return { body: ctx.request.body, query: ctx.request.query }\n' +
            '}\n' +
            'export async function withParams(params, ctx) {\n' +
            '  return { params, urlParams: ctx.params }\n' +
            '}\n',
    )

    // middleware
    await mkdir(join(tmpRoot, 'server/api-middleware'), { recursive: true })
    await writeFile(
        join(tmpRoot, 'server/api-middleware/auth.ts'),
        'export default async function auth(_params, ctx) {\n' +
            '  if (!ctx.request.headers.authorization) {\n' +
            '    return ctx.reply.code(401).send({ error: "Unauthorized" })\n' +
            '  }\n' +
            '}\n',
    )
    await writeFile(
        join(tmpRoot, 'server/api-middleware/logger.ts'),
        'export default async function logger(_params, _ctx) {\n' +
            '  ;(globalThis as any).__mwCalls = ((globalThis as any).__mwCalls ?? 0) + 1\n' +
            '}\n',
    )
})

afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
})

/**
 * Создаёт Fastify + регистрирует роуты.
 *
 * @param routes API-роуты.
 * @returns Fastify-инстанс.
 */
async function makeApp(routes: ServerRoute[]): Promise<FastifyInstance> {
    const app = Fastify({ logger: false })
    await registerServerRoutes(app, routes, tmpRoot)
    return app
}

describe('registerServerRoutes — интеграция (inject)', () => {
    it('GET /api/ping → 200 JSON', async () => {
        const app = await makeApp([
            {
                method: 'GET',
                path: '/api/ping',
                handler: 'server/api/handlers/ping:ping',
            },
        ])
        const res = await app.inject({ method: 'GET', url: '/api/ping' })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ ok: true, method: 'GET' })
    })

    it('POST /api/echo → body и query', async () => {
        const app = await makeApp([
            {
                method: 'POST',
                path: '/api/echo',
                handler: 'server/api/handlers/ping:echo',
            },
        ])
        const res = await app.inject({
            method: 'POST',
            url: '/api/echo?foo=bar',
            payload: { hello: 'world' },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({
            body: { hello: 'world' },
            query: { foo: 'bar' },
        })
    })

    it('Fastify URL params (:id) в ctx.params', async () => {
        const app = await makeApp([
            {
                method: 'GET',
                path: '/api/user/:id',
                handler: 'server/api/handlers/ping:withParams',
                params: { limit: 5 },
            },
        ])
        const res = await app.inject({ method: 'GET', url: '/api/user/42' })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({
            params: { limit: 5 },
            urlParams: { id: '42' },
        })
    })

    it('middleware вызывается', async () => {
        ;(globalThis as { __mwCalls?: number }).__mwCalls = 0
        const app = await makeApp([
            {
                method: 'GET',
                path: '/api/ping',
                handler: 'server/api/handlers/ping:ping',
                middleware: [{ id: 'logger', handler: 'server/api-middleware/logger' }],
            },
        ])
        await app.inject({ method: 'GET', url: '/api/ping' })
        expect((globalThis as { __mwCalls?: number }).__mwCalls).toBe(1)
    })

    it('middleware может остановить — 401, handler не вызывается', async () => {
        ;(globalThis as { __mwCalls?: number }).__mwCalls = 0
        const app = await makeApp([
            {
                method: 'GET',
                path: '/api/protected',
                handler: 'server/api/handlers/ping:ping',
                middleware: [{ id: 'auth', handler: 'server/api-middleware/auth' }],
            },
        ])
        const res = await app.inject({ method: 'GET', url: '/api/protected' })
        expect(res.statusCode).toBe(401)
        expect(res.json()).toEqual({ error: 'Unauthorized' })
    })

    it('middleware пропускает с Authorization', async () => {
        const app = await makeApp([
            {
                method: 'GET',
                path: '/api/protected',
                handler: 'server/api/handlers/ping:ping',
                middleware: [{ id: 'auth', handler: 'server/api-middleware/auth' }],
            },
        ])
        const res = await app.inject({
            method: 'GET',
            url: '/api/protected',
            headers: { authorization: 'Bearer test' },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ ok: true, method: 'GET' })
    })

    it('неизвестный путь → 404 (Fastify сам)', async () => {
        const app = await makeApp([
            {
                method: 'GET',
                path: '/api/ping',
                handler: 'server/api/handlers/ping:ping',
            },
        ])
        const res = await app.inject({ method: 'GET', url: '/api/nope' })
        expect(res.statusCode).toBe(404)
    })

    it('невалидный handler — 500 при вызове (ленивая загрузка)', async () => {
        const app = Fastify({ logger: false })

        // Регистрация проходит — handler грузится лениво, при вызове.
        await registerServerRoutes(
            app,
            [
                {
                    method: 'GET',
                    path: '/api/x',
                    handler: 'server/api/handlers/not-found:handler',
                },
            ],
            tmpRoot,
        )

        // При вызове — 500 (Fastify ловит throw из handler'а).
        const res = await app.inject({ method: 'GET', url: '/api/x' })
        expect(res.statusCode).toBe(500)
    })
})
