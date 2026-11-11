import type { ServiceCacheEntry } from '../../types'

/** Изоморфный исполнитель. */
export type Executor = (payload: string, headers: Record<string, string>) => Promise<Response>

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
            __settiRpcGetContext?: () => { headers: Record<string, string> } | undefined
        }
    ).__settiRpcGetContext
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
            __settiRpcGetContext?: () => { executor: Executor } | undefined
        }
    ).__settiRpcGetContext
    return getCtx?.()?.executor ?? null
}

/**
 * Per-request кэш `SettiService` (из ALS).
 *
 * @returns `Map` или `null` вне SSR.
 */
export function getServerCache(): Map<string, ServiceCacheEntry> | null {
    if (!isServer()) return null
    const getCtx = (
        globalThis as unknown as {
            __settiRpcGetContext?: () => { cache?: Map<string, ServiceCacheEntry> } | undefined
        }
    ).__settiRpcGetContext
    return getCtx?.()?.cache ?? null
}
