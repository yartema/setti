import { describe, expect, it } from 'vitest'
import { ERROR_CODES, processBody, processOne } from './process'
import { RpcRegistry } from '../rpc-registry'
import type { JsonRpcResponse } from './process'
import type { RpcMethodDefinition, RpcObjectDefinition, RpcParamsSchema } from '../../types'

/**
 * Создаёт `RpcRegistry` с одним объектом и заданными методами.
 *
 * @param methods методы объекта.
 * @param name имя объекта (по умолчанию `Users`).
 * @returns реестр.
 */
function makeRegistry(
    methods: Record<string, RpcMethodDefinition<unknown, unknown>> = {
        Ping: { handler: async () => ({ ok: true }) },
    },
    name = 'Users',
): RpcRegistry {
    const reg = new RpcRegistry()
    const obj: RpcObjectDefinition = { name, methods }
    reg.add(obj)
    return reg
}

/**
 * Строит JSON-RPC payload с дефолтами.
 *
 * @param overrides поля запроса.
 * @returns payload.
 */
function makeRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        jsonrpc: '2.0',
        method: 'Users.Ping',
        id: 1,
        ...overrides,
    }
}

/**
 * Простая Standard Schema, всегда успешная.
 * Если `expected` задан — проверяет, что value === expected.
 *
 * @param expected ожидаемое значение (для проверки).
 * @returns схема.
 */
function passthroughSchema<T>(expected?: T): RpcParamsSchema<T> {
    return {
        '~standard': {
            version: 1,
            vendor: 'test',
            validate: (v) => {
                if (expected !== undefined && v !== expected) {
                    return { issues: [{ message: 'mismatch' }] }
                }
                return { value: v as T }
            },
        },
    }
}

/**
 * Схема, которая всегда возвращает issue.
 *
 * @returns схема.
 */
function failingSchema(): RpcParamsSchema<unknown> {
    return {
        '~standard': {
            version: 1,
            vendor: 'test',
            validate: () => ({
                issues: [{ message: 'invalid', path: ['limit'] }],
            }),
        },
    }
}

describe('processOne', () => {
    describe('базовые вызовы', () => {
        it('возвращает result, если метод найден', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest(), 1, reg, 'req', {})
            expect(res.jsonrpc).toBe('2.0')
            expect(res.error).toBeUndefined()
            expect(res.result).toEqual({ ok: true })
            expect(res.id).toBe(1)
        })

        it('id: число', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest({ id: 42 }), 1, reg, 'req', {})
            expect(res.id).toBe(42)
        })

        it('id: строка', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest({ id: 'abc' }), 1, reg, 'req', {})
            expect(res.id).toBe('abc')
        })

        it('id: null сохраняется', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest({ id: null }), 1, reg, 'req', {})
            expect(res.id).toBeNull()
        })

        it('fallbackId, если id нет', async () => {
            const reg = makeRegistry()
            const req = makeRequest()
            delete req.id
            const res = await processOne(req, 99, reg, 'req', {})
            expect(res.id).toBe(99)
        })

        it('fallbackId, если id — объект (игнорируется)', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest({ id: { bad: true } }), 7, reg, 'req', {})
            expect(res.id).toBe(7)
        })

        it('requestId пробрасывается в ctx', async () => {
            const reg = makeRegistry({
                Ping: {
                    handler: async (_p, ctx) => ({ requestId: ctx.requestId }),
                },
            })
            const res = await processOne(makeRequest(), 1, reg, 'my-request-id', {})
            expect(res.result).toEqual({ requestId: 'my-request-id' })
        })

        it('extension мержится в ctx', async () => {
            const reg = makeRegistry({
                Ping: {
                    handler: async (_p, ctx) => ({
                        user: ctx.user,
                        db: ctx.db,
                    }),
                },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {
                user: { id: 1, roles: ['admin'] },
                db: { name: 'fake-db' },
            })
            expect(res.result).toEqual({
                user: { id: 1, roles: ['admin'] },
                db: { name: 'fake-db' },
            })
        })
    })

    describe('валидация запроса', () => {
        it('-32600 на null', async () => {
            const reg = makeRegistry()
            const res = await processOne(null, 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INVALID_REQUEST)
            expect(res.id).toBe(1)
        })

        it('-32600 на отсутствующий jsonrpc', async () => {
            const reg = makeRegistry()
            const res = await processOne({ method: 'Users.Ping' }, 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INVALID_REQUEST)
        })

        it('-32600 на jsonrpc !== "2.0"', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest({ jsonrpc: '1.0' }), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INVALID_REQUEST)
        })

        it('-32600 на не-строковый method', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest({ method: 123 }), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INVALID_REQUEST)
        })
    })

    describe('method not found', () => {
        it('-32601 на неизвестный метод', async () => {
            const reg = makeRegistry()
            const res = await processOne(makeRequest({ method: 'Users.Nope' }), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.METHOD_NOT_FOUND)
        })

        it('-32601 на internal-метод снаружи', async () => {
            const reg = makeRegistry({
                Secret: {
                    internal: true,
                    handler: async () => 'secret',
                },
            })
            const res = await processOne(makeRequest({ method: 'Users.Secret' }), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.METHOD_NOT_FOUND)
        })
    })

    describe('auth', () => {
        it('-32001 на auth: true без user', async () => {
            const reg = makeRegistry({
                Ping: { auth: true, handler: async () => 'ok' },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.UNAUTHORIZED)
        })

        it('-32001 на auth: { roles } без user', async () => {
            const reg = makeRegistry({
                Ping: { auth: { roles: ['admin'] }, handler: async () => 'ok' },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.UNAUTHORIZED)
        })

        it('-32001 на auth: { roles } с неверной ролью', async () => {
            const reg = makeRegistry({
                Ping: { auth: { roles: ['admin'] }, handler: async () => 'ok' },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {
                user: { id: 1, roles: ['user'] },
            })
            expect(res.error?.code).toBe(ERROR_CODES.UNAUTHORIZED)
            expect(res.error?.message).toMatch(/required role/)
        })

        it('OK auth: true с user', async () => {
            const reg = makeRegistry({
                Ping: { auth: true, handler: async () => 'ok' },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {
                user: { id: 1 },
            })
            expect(res.error).toBeUndefined()
            expect(res.result).toBe('ok')
        })

        it('OK auth: { roles } с нужной ролью', async () => {
            const reg = makeRegistry({
                Ping: { auth: { roles: ['admin'] }, handler: async () => 'ok' },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {
                user: { id: 1, roles: ['admin', 'user'] },
            })
            expect(res.error).toBeUndefined()
            expect(res.result).toBe('ok')
        })
    })

    describe('валидация params', () => {
        it('-32602 на невалидные params', async () => {
            const reg = makeRegistry({
                Ping: {
                    params: failingSchema(),
                    handler: async () => 'ok',
                },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INVALID_PARAMS)
            expect(res.error?.data).toEqual([{ message: 'invalid', path: ['limit'] }])
        })

        it('OK валидные params', async () => {
            const reg = makeRegistry({
                Ping: {
                    params: passthroughSchema(),
                    handler: async (p) => p,
                },
            })
            const res = await processOne(makeRequest({ params: { limit: 10 } }), 1, reg, 'req', {})
            expect(res.error).toBeUndefined()
            expect(res.result).toEqual({ limit: 10 })
        })

        it('params прокидываются в handler как валидированные', async () => {
            const reg = makeRegistry({
                Ping: {
                    params: passthroughSchema(),
                    handler: async (p) => ({ received: p }),
                },
            })
            const res = await processOne(makeRequest({ params: { limit: 5 } }), 1, reg, 'req', {})
            expect(res.result).toEqual({ received: { limit: 5 } })
        })
    })

    describe('handler', () => {
        it('-32603 при throw из handler', async () => {
            const reg = makeRegistry({
                Ping: {
                    handler: async () => {
                        throw new Error('boom')
                    },
                },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INTERNAL_ERROR)
            expect(res.error?.message).toBe('Internal error')
        })

        it('detail из Error пробрасывается в error.detail', async () => {
            const reg = makeRegistry({
                Ping: {
                    handler: async () => {
                        const err = new Error('boom') as Error & { detail?: string }
                        err.detail = 'trace-1'
                        throw err
                    },
                },
            })
            const res = await processOne(makeRequest(), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INTERNAL_ERROR)
            expect(res.error?.detail).toBe('trace-1')
        })
    })

    describe('ctx.call', () => {
        it('вызывает другой метод', async () => {
            const reg = new RpcRegistry()
            reg.add({
                name: 'Users',
                methods: {
                    List: {
                        handler: async () => [{ id: 1 }, { id: 2 }],
                    },
                    Count: {
                        handler: async (_p, ctx) => {
                            const list = await ctx.call<unknown[]>('Users.List')
                            return { count: list.length }
                        },
                    },
                },
            })
            const res = await processOne(makeRequest({ method: 'Users.Count' }), 1, reg, 'req', {})
            expect(res.error).toBeUndefined()
            expect(res.result).toEqual({ count: 2 })
        })

        it('ctx.call может вызывать internal-методы', async () => {
            const reg = new RpcRegistry()
            reg.add({
                name: 'Users',
                methods: {
                    Secret: {
                        internal: true,
                        handler: async () => 'secret',
                    },
                    Reveal: {
                        handler: async (_p, ctx) => ctx.call('Users.Secret'),
                    },
                },
            })
            const res = await processOne(makeRequest({ method: 'Users.Reveal' }), 1, reg, 'req', {})
            expect(res.error).toBeUndefined()
            expect(res.result).toBe('secret')
        })

        it('ctx.call сохраняет requestId', async () => {
            const reg = new RpcRegistry()
            reg.add({
                name: 'Users',
                methods: {
                    Nested: {
                        handler: async (_p, ctx) => ({ requestId: ctx.requestId }),
                    },
                    Outer: {
                        handler: async (_p, ctx) => ctx.call('Users.Nested'),
                    },
                },
            })
            const res = await processOne(makeRequest({ method: 'Users.Outer' }), 1, reg, 'my-id', {})
            expect(res.result).toEqual({ requestId: 'my-id' })
        })

        it('ctx.call на несуществующий метод — throw', async () => {
            const reg = new RpcRegistry()
            reg.add({
                name: 'Users',
                methods: {
                    Caller: {
                        handler: async (_p, ctx) => ctx.call('Users.Ghost'),
                    },
                },
            })
            const res = await processOne(makeRequest({ method: 'Users.Caller' }), 1, reg, 'req', {})
            // Внутри ctx.call — SettiError, ловится верхним try/catch → -32603
            expect(res.error?.code).toBe(ERROR_CODES.INTERNAL_ERROR)
        })

        it('ctx.call валидирует params', async () => {
            const reg = new RpcRegistry()
            reg.add({
                name: 'Users',
                methods: {
                    NeedParams: {
                        params: failingSchema(),
                        handler: async () => 'ok',
                    },
                    Caller: {
                        handler: async (_p, ctx) => ctx.call('Users.NeedParams', {}),
                    },
                },
            })
            const res = await processOne(makeRequest({ method: 'Users.Caller' }), 1, reg, 'req', {})
            expect(res.error?.code).toBe(ERROR_CODES.INTERNAL_ERROR)
        })
    })
})

describe('processBody', () => {
    it('одиночный запрос — возвращает объект, не массив', async () => {
        const reg = makeRegistry()
        const res = await processBody(makeRequest(), reg, 'req', {})
        expect(Array.isArray(res)).toBe(false)
        expect((res as JsonRpcResponse).result).toEqual({ ok: true })
    })

    it('batch — возвращает массив', async () => {
        const reg = makeRegistry({
            Ping: { handler: async () => 'pong' },
        })
        const res = await processBody(
            [makeRequest({ id: 1 }), makeRequest({ id: 2 }), makeRequest({ id: 3 })],
            reg,
            'req',
            {},
        )
        expect(Array.isArray(res)).toBe(true)
        const arr = res as JsonRpcResponse[]
        expect(arr).toHaveLength(3)
        expect(arr.map((r) => r.id)).toEqual([1, 2, 3])
        expect(arr.every((r) => r.result === 'pong')).toBe(true)
    })

    it('batch: fallbackId 1..N, если id нет', async () => {
        const reg = makeRegistry()
        const req1 = makeRequest()
        delete req1.id
        const req2 = makeRequest()
        delete req2.id
        const res = (await processBody([req1, req2], reg, 'req', {})) as JsonRpcResponse[]
        expect(res.map((r) => r.id)).toEqual([1, 2])
    })

    it('empty batch — одиночный error -32600', async () => {
        const reg = makeRegistry()
        const res = await processBody([], reg, 'req', {})
        expect(Array.isArray(res)).toBe(false)
        expect((res as JsonRpcResponse).error?.code).toBe(ERROR_CODES.INVALID_REQUEST)
        expect((res as JsonRpcResponse).id).toBeNull()
    })

    it('batch с одним invalid — массив с error и result', async () => {
        const reg = makeRegistry({
            Ping: { handler: async () => 'pong' },
        })
        const res = (await processBody(
            [makeRequest({ id: 1 }), { jsonrpc: '2.0', method: 'Users.Nope', id: 2 }],
            reg,
            'req',
            {},
        )) as JsonRpcResponse[]
        expect(res).toHaveLength(2)
        expect(res[0].result).toBe('pong')
        expect(res[1].error?.code).toBe(ERROR_CODES.METHOD_NOT_FOUND)
    })

    it('extension применяется к каждому запросу в batch', async () => {
        const reg = makeRegistry({
            Ping: {
                handler: async (_p, ctx) => ({ user: ctx.user }),
            },
        })
        const res = (await processBody([makeRequest({ id: 1 }), makeRequest({ id: 2 })], reg, 'req', {
            user: { id: 42 },
        })) as JsonRpcResponse[]
        expect(res[0].result).toEqual({ user: { id: 42 } })
        expect(res[1].result).toEqual({ user: { id: 42 } })
    })
})
