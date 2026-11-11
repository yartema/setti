import { Remote } from './Remote'
import { isServer, getServerExecutor, getCurrentHeaders, getServerCache } from './server-bridge'
import { JsonRpcErrorPayload, RpcError } from '../../errors'
import { stringify as devalueStringify } from 'devalue'
import type { ServiceOptions, CallOptions, ServiceCacheEntry } from '../../types'

/** JSON-RPC ответ. */
interface JsonRpcResponse<R> {
    jsonrpc: '2.0'
    result?: R
    error?: JsonRpcErrorPayload
    id: string | number | null
}

/** Максимум записей в клиентском кэше (если не задан `cacheMaxEntries`). */
const DEFAULT_CACHE_MAX = 500

/**
 * Модульный кэш на клиенте. Один на всё приложение — кросс-страничный,
 * кросс-инстансный. Ограничен LRU (см. `DEFAULT_CACHE_MAX`).
 *
 * На сервере (SSR) используется ALS-кэш (`getServerCache()`), per-request,
 * без LRU — он умирает вместе с запросом.
 */
const clientServiceCache = new Map<string, ServiceCacheEntry>()

/**
 * Помечает ключ как «только что использованный» — перемещает в конец Map,
 * чтобы LRU-эвикция удаляла старые первыми.
 *
 * @param key ключ.
 */
function touchClientCache(key: string): void {
    const entry = clientServiceCache.get(key)
    if (!entry) return
    clientServiceCache.delete(key)
    clientServiceCache.set(key, entry)
}

/**
 * Удаляет старые записи, пока размер не уложится в `max`.
 * Вызывается только на клиенте (серверный кэш — per-request).
 *
 * @param max максимум записей.
 */
function evictClientCache(max: number): void {
    while (clientServiceCache.size > max) {
        const first = clientServiceCache.keys().next()
        if (first.done) break
        clientServiceCache.delete(first.value)
    }
}

/**
 * Изоморфный JSON-RPC 2.0 клиент с LRU-кэшем.
 *
 * - Клиент: `fetch` + кэш в модульном `Map` (LRU, `cacheMaxEntries`).
 * - Сервер (SSR): executor из ALS + per-request кэш (без LRU).
 *
 * @example
 * ```ts
 * const users = new Service({
 *   endpoint: 'Users',
 *   binding: { query: 'List' },
 *   cache: 30_000,
 * })
 * const list = await users.query({ limit: 10 })
 * ```
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
     * @throws {RpcError} при `error` в ответе.
     */
    async call<R = unknown>(method: string, params?: unknown, opts?: CallOptions): Promise<R> {
        const cacheTtl = opts?.cache !== undefined ? opts.cache : this._serviceOpts.cache
        const useCache = typeof cacheTtl === 'number' && cacheTtl > 0
        const store = useCache ? this.getCacheStore() : null
        const cacheKey = useCache ? this.getCacheKey(method, params) : ''

        if (store && cacheKey) {
            const cached = store.get(cacheKey)
            if (cached && cached.expiresAt > Date.now()) {
                // LRU: только для клиентского кэша
                if (!isServer()) touchClientCache(cacheKey)
                return cached.value as R
            }
            if (cached) store.delete(cacheKey)
        }

        const res = await this.callRaw(method, params)
        const data = (await res.json()) as JsonRpcResponse<R>
        if (data.error) throw new RpcError(data.error)
        const result = data.result as R

        if (store && cacheKey && typeof cacheTtl === 'number') {
            store.set(cacheKey, {
                value: result,
                expiresAt: Date.now() + cacheTtl,
            })
            // LRU-эвикция — только на клиенте
            if (!isServer()) {
                evictClientCache(this._serviceOpts.cacheMaxEntries ?? DEFAULT_CACHE_MAX)
            }
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
     * Очищает **всё** клиентское кэш-хранилище (кросс-инстанс).
     * На сервере — no-op (ALS-кэш умирает вместе с запросом).
     */
    static invalidateAll(): void {
        clientServiceCache.clear()
    }

    /**
     * Текущий размер клиентского кэша (для тестов / отладки).
     *
     * @returns количество записей.
     */
    static cacheSize(): number {
        return clientServiceCache.size
    }

    /**
     * CRUD: query (`List` по дефолту, `binding.query` переопределяет).
     *
     * @param params параметры запроса.
     * @param opts per-call опции (`{ cache }`).
     * @returns `result` из JSON-RPC ответа.
     */
    async query<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('query'), params, opts)
    }

    /**
     * CRUD: read (`Read` по дефолту, `binding.read` переопределяет).
     *
     * @param params параметры (обычно `{ id }`).
     * @param opts per-call опции (`{ cache }`).
     * @returns `result` из JSON-RPC ответа.
     */
    async read<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('read'), params, opts)
    }

    /**
     * CRUD: create (`Create` по дефолту, `binding.create` переопределяет).
     *
     * @param params данные новой записи.
     * @param opts per-call опции (`{ cache }`).
     * @returns `result` из JSON-RPC ответа.
     */
    async create<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('create'), params, opts)
    }

    /**
     * CRUD: update (`Update` по дефолту, `binding.update` переопределяет).
     *
     * @param params данные для обновления (обычно `{ id, ... }`).
     * @param opts per-call опции (`{ cache }`).
     * @returns `result` из JSON-RPC ответа.
     */
    async update<P = unknown, R = unknown>(params?: P, opts?: CallOptions): Promise<R> {
        return this.call<R>(this.resolveMethod('update'), params, opts)
    }

    /**
     * CRUD: destroy (`Delete` по дефолту, `binding.destroy` переопределяет).
     *
     * @param params параметры (обычно `{ id }`).
     * @param opts per-call опции (`{ cache }`).
     * @returns `result` из JSON-RPC ответа.
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
        if (isServer()) Object.assign(base, getCurrentHeaders())
        return base
    }

    /**
     * Изоморфный execute.
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
