import { defineObject } from 'nixo/server'
import type { RpcContext } from 'nixo/server'

/**
 * Объект БЛ "System" — ping и health.
 */
export default defineObject({
    name: 'System',
    description: 'Служебные методы',
    methods: {
        Ping: {
            description: 'Возвращает pong + requestId',
            handler: async (_params: unknown, ctx: RpcContext) => ({
                pong: true,
                requestId: ctx.requestId,
            }),
        },
    },
})
