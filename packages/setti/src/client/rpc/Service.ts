import { Remote } from './Remote'
import { isServer, getServerExecutor, getCurrentHeaders, getServerCache } from './server-bridge'
import { JsonRpcErrorPayload, SettiRpcError } from '../../errors'
import { stringify as devalueStringify } from 'devalue'
import type { ServiceOptions, CallOptions, ServiceCacheEntry } from '../../types'

/** JSON-RPC ответ. */
interface JsonRpcResponse<R> {
    jsonrpc: '2.0'
    result?: R
    error?: JsonRpcErrorPayload
    id: string | number | null
}

/**
 * Модульный кэш на клиенте. Один на всё приложение — кросс-страничный,
 * кросс-инстансный. На сервере используется ALS (per-request).
 */
const clientServiceCache = new Map<string, ServiceCacheEntry>()

/**
 * Изоморфный JSON-RPC 2.0 клиент с кэшем.
 *
 * - Клиент: `fetch(url, { method: 'POST', body })` + кэш в модульном `Map`.
 * - Сервер (SSR): executor из ALS + кэш в ALS (per-request).
 *
 * Кэш:
 *   - Включается через `new SettiService({ ..., cache: 30000 })`.
 *   - Per-call override: `service.call(method, params, { cache: 60000 })`.
 *   - `cache: false` в опциях вызова — не кэшировать.
 *   - Инвалидация: `service.invalidate()` / `invalidate(method)` / `invalidate(method, params)` / `SettiService.invalidateAll()`.
 */
export class Service<T extends Record<string, unknown> = Record<string, unknown>> extends Remote<T> {
    private _serviceOpts: ServiceOptions

    /**
     * @param opts опции.
     */
    constructor(opts: ServiceOptions = {}) {
        super(opts)
        this._serviceOpts = opts
    }

    /**
     * Ключ кэша: `endpoint.method:devalueStringify(params)`.
     *
     * @param method метод.
     * @param params параметры.
     * @returns ключ.
     */
    private getCacheKey(method: string, params?: unknown): string {
        const endpoint = this._serviceOpts.endpoint ?? ''
        return `${endpoint}.${method}:${devalueStringify(params ?? {})}`
    }

    /**
     * Хранилище кэша: ALS (SSR) или модульный `Map` (клиент).
     *
     * @returns `Map` или `null`.
     */
    private getCacheStore(): Map<string, ServiceCacheEntry> | null {
        if (isServer()) return getServerCache()
        return clientServiceCache
    }

    /**
     * Низкоуровневый JSON-RPC вызов (без кэша).
     *
     * @param method имя метода.
     * @param params параметры.
     * @returns `Response`.
     */
    async callRaw(method: string, params?: unknown): Promise<Response> {
        const fullMethod = this._serviceOpts.endpoint ? `${this._serviceOpts.endpoint}.${method}` : method

        const payload = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: fullMethod,
            params: params ?? {},
        })

        return this.executeRequest(payload)
    }

    /**
     * JSON-RPC вызов с кэшем.
     *
     * @param method имя метода.
     * @param params параметры.
     * @param opts per-call опции (`{ cache }`).
     * @returns `result`.
     * @throws {SettiRpcError} при `error` в ответе.
     */
    async call<R = unknown>(method: string, params?: unknown, opts?: CallOptions): Promise<R> {
        const cacheTtl = opts?.cache !== undefined ? opts.cache : this._serviceOpts.cache
        const useCache = typeof cacheTtl === 'number' && cacheTtl > 0
        const store = useCache ? this.getCacheStore() : null
        const cacheKey = useCache ? this.getCacheKey(method, params) : ''

        if (store && cacheKey) {
            const cached = store.get(cacheKey)
            if (cached && cached.expiresAt > Date.now()) {
                return cached.value as R
            }
            if (cached) store.delete(cacheKey)
        }

        const res = await this.callRaw(method, params)
        const data = (await res.json()) as JsonRpcResponse<R>
        if (data.error) throw new SettiRpcError(data.error)
        const result = data.result as R

        if (store && cacheKey && typeof cacheTtl === 'number') {
            store.set(cacheKey, {
                value: result,
                expiresAt: Date.now() + cacheTtl,
            })
        }

        return result
    }

    /**
     * Инвалидирует кэш.
     *
     * - `invalidate()` — всё для текущего `endpoint`.
     * - `invalidate(method)` — все ключи метода.
     * - `invalidate(method, params)` — точечно.
     *
     * @param method метод.
     * @param params параметры.
     */
    invalidate(method?: string, params?: unknown): void {
        const store = this.getCacheStore()
        if (!store) return

        const endpoint = this._serviceOpts.endpoint ?? ''

        if (method === undefined) {
            const prefix = `${endpoint}.`
            for (const key of store.keys()) {
                if (key.startsWith(prefix)) store.delete(key)
            }
            return
        }

        if (params === undefined) {
            const prefix = `${endpoint}.${method}:`
            for (const key of store.keys()) {
                if (key.startsWith(prefix)) store.delete(key)
            }
            return
        }

        store.delete(this.getCacheKey(method, params))
    }

    /**
     * Очищает **всё** клиентский кэш (кросс-инстанс).
     *
     * На сервере — no-op (per-request кэш в ALS всё равно уничтожится).
     */
    static invalidateAll(): void {
        clientServiceCache.clear()
    }

    /**
     * CRUD: query (`List` по дефолту).
     *
     * @param params параметры.
     * @param opts per-call опции.
     * @returns `result`.
     */
    async query<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('query'), params, opts)
    }

    /**
     * CRUD: read (`Read` по дефолту).
     *
     * @param params параметры.
     * @param opts per-call опции.
     * @returns `result`.
     */
    async read<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('read'), params, opts)
    }

    /**
     * CRUD: create (`Create` по дефолту).
     *
     * @param params параметры.
     * @param opts per-call опции.
     * @returns `result`.
     */
    async create<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('create'), params, opts)
    }

    /**
     * CRUD: update (`Update` по дефолту).
     *
     * @param params параметры.
     * @param opts per-call опции.
     * @returns `result`.
     */
    async update<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('update'), params, opts)
    }

    /**
     * CRUD: destroy (`Delete` по дефолту).
     *
     * @param params параметры.
     * @param opts per-call опции.
     * @returns `result`.
     */
    async destroy<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('destroy'), params, opts)
    }

    /**
     * URL endpoint.
     *
     * @returns URL.
     */
    protected getUrl(): string {
        return this._serviceOpts.url ?? '/service'
    }

    /**
     * Заголовки (на сервере — из ALS).
     *
     * @returns headers.
     */
    protected prepareHeaders(): Record<string, string> {
        const base: Record<string, string> = { 'content-type': 'application/json' }
        if (isServer()) {
            Object.assign(base, getCurrentHeaders())
        }
        return base
    }

    /**
     * Изоморфный execute:
     *   - SSR + executor → прямой вызов (без HTTP);
     *   - иначе → fetch.
     *
     * @param payload JSON-RPC payload.
     * @returns `Response`.
     */
    protected async executeRequest(payload: string): Promise<Response> {
        if (isServer()) {
            const executor = getServerExecutor()
            if (executor) return executor(payload, this.prepareHeaders())
        }
        return fetch(this.getUrl(), {
            method: 'POST',
            headers: this.prepareHeaders(),
            body: payload,
            credentials: 'same-origin',
        })
    }
}
