import type { ServiceCacheEntry } from '../../types'

/** Изоморфный исполнитель. */
export type Executor = (
    payload: string,
    headers: Record<string, string>,
) => Promise<Response>

/**
 * Определяет, выполняется ли код на сервере.
 *
 * @returns `true` в Node.js.
 */
export function isServer(): boolean {
    return typeof window === 'undefined'
}

/**
 * Заголовки текущего SSR-запроса (из ALS).
 *
 * @returns headers или `{}`.
 */
export function getCurrentHeaders(): Record<string, string> {
    if (!isServer()) return {}
    const getCtx = (
        globalThis as unknown as {
            __nixoRpcGetContext?: () => { headers: Record<string, string> } | undefined
        }
    ).__nixoRpcGetContext
    return getCtx?.()?.headers ?? {}
}

/**
 * Executor текущего SSR-запроса.
 *
 * @returns executor или `null`.
 */
export function getServerExecutor(): Executor | null {
    if (!isServer()) return null
    const getCtx = (
        globalThis as unknown as {
            __nixoRpcGetContext?: () => { executor: Executor } | undefined
        }
    ).__nixoRpcGetContext
    return getCtx?.()?.executor ?? null
}

/**
 * Per-request кэш `NixoService` (из ALS).
 *
 * @returns `Map` или `null` вне SSR.
 */
export function getServerCache(): Map<string, ServiceCacheEntry> | null {
    if (!isServer()) return null
    const getCtx = (
        globalThis as unknown as {
            __nixoRpcGetContext?: () =>
                | { cache?: Map<string, ServiceCacheEntry> }
                | undefined
        }
    ).__nixoRpcGetContext
    return getCtx?.()?.cache ?? null
}