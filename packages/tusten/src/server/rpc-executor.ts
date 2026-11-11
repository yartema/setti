import { randomUUID } from 'node:crypto'
import type { RpcRegistry } from './rpc-registry'
import type { RpcExecutor, ResolvedTustenConfig } from '../types'
import { processBody } from './rpc/process'

/**
 * Создаёт JSON-RPC executor для SSR (прямой вызов handler'а, без HTTP).
 *
 * Используется `Service.call` через `getServerExecutor()` (ALS).
 *
 * @param registry реестр.
 * @param config нормализованный конфиг.
 * @returns `(payload, headers) => Promise<Response>`.
 */
export function createRpcExecutor(registry: RpcRegistry, config: ResolvedTustenConfig): RpcExecutor {
    return async (payload: string, headers: Record<string, string>) => {
        const requestId = headers['x-request-id'] ?? randomUUID()
        const body = JSON.parse(payload)

        let extension: Record<string, unknown> = {}
        if (config.rpc.extendContext) {
            try {
                extension = await config.rpc.extendContext({ headers })
            } catch (err) {
                console.error('[tusten] rpc.extendContext (executor) failed:', err)
            }
        }

        const response = await processBody(body, registry, requestId, extension)
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-request-id': requestId,
            },
        })
    }
}
