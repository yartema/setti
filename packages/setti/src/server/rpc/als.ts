import { AsyncLocalStorage } from 'node:async_hooks'
import type { RpcExecutor, ServiceCacheEntry } from '../../types'

/** Контекст SSR-запроса для RPC. */
export interface RpcAlsContext {
    /** Headers текущего SSR-запроса. */
    headers: Record<string, string>
    /** Cookies (парсинг из headers.cookie). */
    cookies: Record<string, string>
    /** Прямой исполнитель JSON-RPC (без HTTP). */
    executor: RpcExecutor
    /**
     * Кэш `SettiService` для текущего SSR-запроса.
     * Живёт в рамках одного запроса — не утекает между пользователями.
     */
    cache: Map<string, ServiceCacheEntry>
}

const als = new AsyncLocalStorage<RpcAlsContext>()

/**
 * Запускает функцию в контексте SSR-запроса.
 *
 * @param ctx контекст.
 * @param fn функция (рендер).
 * @returns результат `fn`.
 */
export function runWithRpcContext<T>(ctx: RpcAlsContext, fn: () => T): T {
    return als.run(ctx, fn)
}

/**
 * Текущий контекст (только внутри `runWithRpcContext`).
 *
 * @returns контекст или `undefined`.
 */
export function getRpcContext(): RpcAlsContext | undefined {
    return als.getStore()
}

/**
 * Парсит cookie-строку в объект.
 *
 * @param cookie заголовок `Cookie`.
 * @returns объект cookie.
 */
export function parseCookieHeader(cookie: string | undefined): Record<string, string> {
    if (!cookie) return {}
    const result: Record<string, string> = {}
    for (const pair of cookie.split(';')) {
        const idx = pair.indexOf('=')
        if (idx === -1) continue
        const key = pair.slice(0, idx).trim()
        const value = pair.slice(idx + 1).trim()
        if (key) result[key] = decodeURIComponent(value)
    }
    return result
}
