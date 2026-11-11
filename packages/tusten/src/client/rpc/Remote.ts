import type { CrudOp, IBinding, ServiceOptions } from '../../types'

/**
 * Базовый класс для CRUD-обёрток над JSON-RPC.
 *
 * Не знает про URL/headers — это делает `Service`.
 * Пока — минимальный каркас; полная реализация (list/read/create/update/delete) — R5.
 */
export abstract class Remote<T extends Record<string, unknown> = Record<string, unknown>> {
    protected _remoteOpts: ServiceOptions

    /**
     * @param opts опции сервиса.
     */
    constructor(opts: ServiceOptions) {
        this._remoteOpts = opts
    }

    /**
     * Получить имя метода объекта для CRUD-операции.
     *
     * @param op CRUD-операция.
     * @returns имя метода (`Read`, `List`, ...).
     */
    protected resolveMethod(op: CrudOp): string {
        const binding: IBinding = this._remoteOpts.binding ?? {}
        return binding[op] ?? DEFAULT_BINDING[op]
    }

    /**
     * Заглушка; полная реализация в R5.
     *
     * @param _method имя метода объекта.
     * @param _params параметры вызова.
     * @returns `Response`.
     */
    protected async _call(_method: string, _params?: unknown): Promise<Response> {
        throw new Error('Remote: not implemented yet (Phase R5)')
    }

    // Поля-заглушки, чтобы `T` не был unused.
    protected _phantom?: T
}

/** Дефолтный маппинг CRUD → имя метода объекта. */
const DEFAULT_BINDING: Record<CrudOp, string> = {
    read: 'Read',
    query: 'List',
    create: 'Create',
    update: 'Update',
    destroy: 'Delete',
}
