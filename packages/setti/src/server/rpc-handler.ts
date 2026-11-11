import type { FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RpcRegistry } from './rpc-registry'
import type { ResolvedSettiConfig } from '../types'
import { processBody } from './rpc/process'

/** Опции `createRpcHandler`. */
export interface RpcHandlerOptions {
    registry: RpcRegistry
    config: ResolvedSettiConfig
}

/**
 * Создаёт Fastify handler для `POST /service` (JSON-RPC 2.0).
 *
 * @param options опции.
 * @returns Fastify handler.
 */
export function createRpcHandler(options: RpcHandlerOptions) {
    const { registry, config } = options

    return async function handler(
        req: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        const requestId =
            (req.headers['x-request-id'] as string | undefined) ?? randomUUID()
        reply.header('X-Request-Id', requestId)

        let extension: Record<string, unknown> = {}
        if (config.rpc.extendContext) {
            try {
                extension = await config.rpc.extendContext(req)
            } catch (err) {
                console.error('[setti] rpc.extendContext failed:', err)
            }
        }

        const response = await processBody(req.body, registry, requestId, extension)
        reply.code(200).type('application/json').send(response)
    }
}