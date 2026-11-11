// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Service } from './Service'
import { TustenRpcError } from '../../errors'

/**
 *
 * @param body
 * @param status
 */
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

/**
 * @param result
 * @param id
 */
function rpcOk(result: unknown, id: number | string | null = 1): Response {
    return jsonResponse({ jsonrpc: '2.0', result, id })
}

/**
 *
 * @param code
 * @param message
 * @param data
 * @param id
 */
function rpcErr(code: number, message: string, data?: unknown, id: number | string | null = 1): Response {
    return jsonResponse({
        jsonrpc: '2.0',
        error: data !== undefined ? { code, message, data } : { code, message },
        id,
    })
}

describe('Service', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        Service.invalidateAll()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // === call / callRaw ===

    it('call возвращает result', async () => {
        fetchMock.mockImplementation(async () => rpcOk('pong'))
        const svc = new Service({ endpoint: 'Users' })
        expect(await svc.call('Ping')).toBe('pong')
    })

    it('callRaw возвращает Response', async () => {
        fetchMock.mockImplementation(async () => rpcOk('pong'))
        const svc = new Service({ endpoint: 'Users' })
        const res = await svc.callRaw('Ping')
        expect(res).toBeInstanceOf(Response)
        expect(res.status).toBe(200)
    })

    it('body в fetch — правильный JSON-RPC', async () => {
        fetchMock.mockImplementation(async () => rpcOk('ok'))
        const svc = new Service({ endpoint: 'Users' })
        await svc.call('Ping', { limit: 5 })
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('/service')
        expect(init.method).toBe('POST')
        expect(JSON.parse(init.body as string)).toEqual({
            jsonrpc: '2.0',
            id: 1,
            method: 'Users.Ping',
            params: { limit: 5 },
        })
    })

    it('без endpoint — method как есть', async () => {
        fetchMock.mockImplementation(async () => rpcOk('ok'))
        const svc = new Service({})
        await svc.call('System.Ping')
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(JSON.parse(init.body as string).method).toBe('System.Ping')
    })

    it('кастомный url', async () => {
        fetchMock.mockImplementation(async () => rpcOk('ok'))
        const svc = new Service({ endpoint: 'Users', url: '/rpc' })
        await svc.call('Ping')
        expect(fetchMock.mock.calls[0][0]).toBe('/rpc')
    })

    it('content-type', async () => {
        fetchMock.mockImplementation(async () => rpcOk('ok'))
        const svc = new Service({ endpoint: 'Users' })
        await svc.call('Ping')
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    })

    it('ошибка из ответа → TustenRpcError', async () => {
        fetchMock.mockImplementation(async () => rpcErr(-32601, 'Method not found'))
        const svc = new Service({ endpoint: 'Users' })
        const err = (await svc.call('Nope').catch((e) => e)) as TustenRpcError
        expect(err).toBeInstanceOf(TustenRpcError)
        expect(err.code).toBe(-32601)
        expect(err.message).toContain('Method not found')
    })

    it('error.data сохраняется', async () => {
        fetchMock.mockImplementation(async () => rpcErr(-32602, 'Invalid params', { field: 'limit' }))
        const svc = new Service({ endpoint: 'Users' })
        const err = (await svc.call('Ping').catch((e) => e)) as TustenRpcError
        expect(err.data).toEqual({ field: 'limit' })
    })

    // === CRUD ===

    it('query → List', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        await new Service({ endpoint: 'Users' }).query()
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).method).toBe('Users.List')
    })

    it('read → Read', async () => {
        fetchMock.mockImplementation(async () => rpcOk({}))
        await new Service({ endpoint: 'Users' }).read({ id: 1 })
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).method).toBe('Users.Read')
    })

    it('create → Create', async () => {
        fetchMock.mockImplementation(async () => rpcOk({}))
        await new Service({ endpoint: 'Users' }).create({ name: 'x' })
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).method).toBe('Users.Create')
    })

    it('update → Update', async () => {
        fetchMock.mockImplementation(async () => rpcOk({}))
        await new Service({ endpoint: 'Users' }).update({ id: 1 })
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).method).toBe('Users.Update')
    })

    it('destroy → Delete', async () => {
        fetchMock.mockImplementation(async () => rpcOk({}))
        await new Service({ endpoint: 'Users' }).destroy({ id: 1 })
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).method).toBe('Users.Delete')
    })

    it('binding переопределяет метод', async () => {
        fetchMock.mockImplementation(async () => rpcOk({}))
        const svc = new Service({ endpoint: 'Users', binding: { query: 'ListAll' } })
        await svc.query()
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).method).toBe('Users.ListAll')
    })

    // === Кэш ===

    it('cache: N — второй вызов из кэша', async () => {
        fetchMock.mockImplementation(async () => rpcOk([{ id: 1 }]))
        const svc = new Service({ endpoint: 'Users', cache: 30_000 })
        await svc.query({ limit: 5 })
        await svc.query({ limit: 5 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('cache: N — разные params → разный кэш', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svc = new Service({ endpoint: 'Users', cache: 30_000 })
        await svc.query({ limit: 5 })
        await svc.query({ limit: 10 })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('cache: false — всегда fetch', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svc = new Service({ endpoint: 'Users', cache: 30_000 })
        await svc.query({ limit: 5 }, { cache: false })
        await svc.query({ limit: 5 }, { cache: false })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('cache: 60000 per-call переопределяет', async () => {
        fetchMock.mockImplementation(async () => rpcOk('pong'))
        const svc = new Service({ endpoint: 'Users', cache: 1 })
        await svc.call('Ping', {}, { cache: 60_000 })
        await svc.call('Ping', {}, { cache: 60_000 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('TTL истекает — повторный fetch', async () => {
        fetchMock.mockImplementation(async () => rpcOk('pong'))
        const svc = new Service({ endpoint: 'Users', cache: 1000 })

        const nowSpy = vi.spyOn(Date, 'now')
        nowSpy.mockReturnValue(1000)
        await svc.call('Ping')

        nowSpy.mockReturnValue(1500)
        await svc.call('Ping')
        expect(fetchMock).toHaveBeenCalledTimes(1)

        nowSpy.mockReturnValue(3000)
        await svc.call('Ping')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('invalidate() сбрасывает endpoint', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svc = new Service({ endpoint: 'Users', cache: 30_000 })
        await svc.query()
        await svc.query()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        svc.invalidate()
        await svc.query()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('invalidate(method)', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svc = new Service({ endpoint: 'Users', cache: 30_000 })
        await svc.query()
        await svc.read({ id: 1 })
        svc.invalidate('List')
        await svc.query()
        await svc.read({ id: 1 })
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('invalidate(method, params)', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svc = new Service({ endpoint: 'Users', cache: 30_000 })
        await svc.query({ limit: 5 })
        await svc.query({ limit: 10 })
        svc.invalidate('List', { limit: 5 })
        await svc.query({ limit: 5 })
        await svc.query({ limit: 10 })
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('static invalidateAll()', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svcA = new Service({ endpoint: 'A', cache: 30_000 })
        const svcB = new Service({ endpoint: 'B', cache: 30_000 })
        await svcA.query()
        await svcB.query()
        expect(fetchMock).toHaveBeenCalledTimes(2)
        Service.invalidateAll()
        await svcA.query()
        await svcB.query()
        expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('cache: undefined → без кэша', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svc = new Service({ endpoint: 'Users' })
        await svc.query()
        await svc.query()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('cache: 0 → без кэша', async () => {
        fetchMock.mockImplementation(async () => rpcOk([]))
        const svc = new Service({ endpoint: 'Users', cache: 0 })
        await svc.query()
        await svc.query()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
