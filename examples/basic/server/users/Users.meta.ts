import { defineObject } from '@tusten/core/server'
import type { RpcContext } from '@tusten/core/server'

/**
 * Объект БЛ "Users" — демонстрация JSON-RPC.
 *
 * В R2 handler'ы ещё не вызываются (endpoint появится в R3),
 * но реестр собирается и валидируется.
 */
export default defineObject({
    name: 'Users',
    description: 'Пользователи',
    methods: {
        List: {
            description: 'Список пользователей',
            handler: async (params: unknown, _ctx: RpcContext) => {
                const { limit } = (params ?? {}) as { limit?: number }
                const n = limit ?? 10
                return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `user${i + 1}` }))
            },
        },
        Read: {
            description: 'Один пользователь по id',
            handler: async (params: unknown, _ctx: RpcContext) => {
                const { id } = (params ?? {}) as { id: number }
                return { id, name: `user${id}` }
            },
        },
        Count: {
            description: 'Считает пользователей через ctx.call',
            handler: async (params: unknown, ctx: RpcContext) => {
                const { limit } = (params ?? {}) as { limit?: number }
                const users = await ctx.call<{ id: number }[]>('Users.List', { limit })
                return { count: users.length }
            },
        },
        Secret: {
            internal: true,
            handler: async (_p: unknown, _ctx: RpcContext) => ({ secret: 42 }),
        },
    },
})
