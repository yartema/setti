import { NixoError } from '../../errors'
import type { RpcRegistry } from '../rpc-registry'
import type { RpcContext, RpcMethodDefinition } from '../../types'
import type { JsonRpcErrorPayload } from '../../errors'

/** JSON-RPC ID. */
export type JsonRpcId = string | number | null

/** JSON-RPC ошибка (совпадает по форме с `JsonRpcErrorPayload`). */
export type JsonRpcError = JsonRpcErrorPayload

/** JSON-RPC ответ. */
export interface JsonRpcResponse {
    jsonrpc: '2.0'
    result?: unknown
    error?: JsonRpcError
    id: JsonRpcId
}

/** Коды ошибок JSON-RPC 2.0. */
export const ERROR_CODES = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    UNAUTHORIZED: -32001,
} as const

/**
 * Обрабатывает один JSON-RPC запрос.
 *
 * @param raw тело запроса (неизвестной формы).
 * @param fallbackId `id` по умолчанию.
 * @param registry реестр.
 * @param requestId ID запроса.
 * @param extension расширение контекста.
 * @returns JSON-RPC ответ.
 */
export async function processOne(
    raw: unknown,
    fallbackId: number,
    registry: RpcRegistry,
    requestId: string,
    extension: Record<string, unknown>,
): Promise<JsonRpcResponse> {
    let id: JsonRpcId = fallbackId
    if (raw && typeof raw === 'object' && 'id' in raw) {
        const rawId = (raw as { id: unknown }).id
        if (typeof rawId === 'string' || typeof rawId === 'number') id = rawId
        else if (rawId === null) id = null
    }

    if (!raw || typeof raw !== 'object') {
        return errorResponse(id, ERROR_CODES.INVALID_REQUEST, 'Invalid Request')
    }
    const reqObj = raw as Record<string, unknown>
    if (reqObj.jsonrpc !== '2.0') {
        return errorResponse(id, ERROR_CODES.INVALID_REQUEST, 'jsonrpc must be "2.0"')
    }
    if (typeof reqObj.method !== 'string') {
        return errorResponse(id, ERROR_CODES.INVALID_REQUEST, 'method must be a string')
    }

    // System.Describe — встроенный метод (если включён в конфиге).
    if (reqObj.method === 'System.Describe') {
        const config = (globalThis as unknown as { __nixoRpcConfig?: { describe?: boolean } }).__nixoRpcConfig
        if (config?.describe === false) {
            return errorResponse(id, ERROR_CODES.METHOD_NOT_FOUND, 'Method "System.Describe" not found')
        }
        return {
            jsonrpc: '2.0',
            result: registry.describe(),
            id,
        }
    }

    const method = registry.getMethod(reqObj.method)
    if (!method || method.method.internal) {
        return errorResponse(
            id,
            ERROR_CODES.METHOD_NOT_FOUND,
            `Method "${reqObj.method}" not found`,
        )
    }

    const authFail = checkAuth(method.method, extension)
    if (authFail) {
        return errorResponse(id, ERROR_CODES.UNAUTHORIZED, authFail)
    }

    let params: unknown = reqObj.params
    if (method.method.params) {
        try {
            const result = await method.method.params['~standard'].validate(reqObj.params)
            if ('issues' in result && result.issues) {
                return errorResponse(
                    id,
                    ERROR_CODES.INVALID_PARAMS,
                    'Invalid params',
                    result.issues,
                )
            }
            params = (result as { value: unknown }).value
        } catch (err) {
            return errorResponse(
                id,
                ERROR_CODES.INVALID_PARAMS,
                'Invalid params',
                (err as Error).message,
            )
        }
    }

    // Сначала создаём контейнер, потом наполняем.
    // `call` рекурсивно ссылается на ctx — обходим TS2448.
    const ctx = {} as RpcContext

    ctx.requestId = requestId
    ctx.call = async <R = unknown>(m: string, p?: unknown): Promise<R> => {
        const target = registry.getMethod(m)
        if (!target) {
            throw new NixoError(`Method "${m}" not found`)
        }
        let localParams: unknown = p
        if (target.method.params) {
            const result = await target.method.params['~standard'].validate(p)
            if ('issues' in result && result.issues) {
                throw new NixoError(
                    `Invalid params for "${m}": ${JSON.stringify(result.issues)}`,
                )
            }
            localParams = (result as { value: unknown }).value
        }
        return (await target.method.handler(localParams, ctx)) as R
    }

    // Мержим extension (user, db, trace...).
    for (const [k, v] of Object.entries(extension)) {
        ;(ctx as Record<string, unknown>)[k] = v
    }

    try {
        const result = await method.method.handler(params, ctx)
        return { jsonrpc: '2.0', result, id }
    } catch (err) {
        console.error(`[nixo] RPC ${reqObj.method} error:`, err)
        const e = err as { message?: string; detail?: string }
        return errorResponse(
            id,
            ERROR_CODES.INTERNAL_ERROR,
            'Internal error',
            e.message,
            e.detail,
        )
    }
}

/**
 * Обрабатывает batch или одиночный запрос.
 *
 * @param body тело (`unknown`).
 * @param registry реестр.
 * @param requestId ID запроса.
 * @param extension расширение.
 * @returns одиночный ответ или массив.
 */
export async function processBody(
    body: unknown,
    registry: RpcRegistry,
    requestId: string,
    extension: Record<string, unknown>,
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
    const isBatch = Array.isArray(body)
    const rawRequests: unknown[] = isBatch ? body : [body]

    if (isBatch && rawRequests.length === 0) {
        return {
            jsonrpc: '2.0',
            error: { code: ERROR_CODES.INVALID_REQUEST, message: 'Empty batch' },
            id: null,
        }
    }

    const responses: JsonRpcResponse[] = []
    for (let i = 0; i < rawRequests.length; i++) {
        responses.push(
            await processOne(rawRequests[i], i + 1, registry, requestId, extension),
        )
    }
    return isBatch ? responses : responses[0]
}

/**
 * Проверяет auth.
 *
 * @param method определение метода.
 * @param extension контекст.
 * @returns сообщение об ошибке или `null`.
 */
function checkAuth(
    method: RpcMethodDefinition<unknown, unknown>,
    extension: Record<string, unknown>,
): string | null {
    if (!method.auth) return null
    const user = extension.user
    if (!user) return 'Unauthorized: user required'
    if (typeof method.auth === 'object' && 'roles' in method.auth) {
        const requiredRoles = method.auth.roles
        const userRoles = (user as { roles?: string[] }).roles ?? []
        const hasRole = requiredRoles.some((r) => userRoles.includes(r))
        if (!hasRole) {
            return `Unauthorized: required role ${requiredRoles.join(' | ')}`
        }
    }
    return null
}

/**
 * JSON-RPC ответ с ошибкой.
 *
 * @param id id.
 * @param code код.
 * @param message сообщение.
 * @param data дополнительные данные.
 * @param detail дополнительное описание.
 * @returns ответ.
 */
function errorResponse(
    id: JsonRpcId,
    code: number,
    message: string,
    data?: unknown,
    detail?: string,
): JsonRpcResponse {
    const error: JsonRpcError = { code, message }
    if (detail !== undefined) error.detail = detail
    if (data !== undefined) error.data = data
    return { jsonrpc: '2.0', error, id }
}