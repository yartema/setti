/**
 * Базовый класс ошибок фреймворка tusten.
 *
 * Все ошибки, которые может бросить сканнер, валидатор или сам фреймворк,
 * наследуются от `TustenError` — это позволяет вызывающему коду отличать
 * ошибки фреймворка от случайных исключений.
 */
export class TustenError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'TustenError'
    }
}

/** JSON-RPC ошибка. */
export interface JsonRpcErrorPayload {
    code: number
    message: string
    detail?: string
    data?: unknown
}

/**
 * Ошибка JSON-RPC. Бросается `Service.call` при `error` в ответе.
 */
export class TustenRpcError extends TustenError {
    /** Оригинальный JSON-RPC error. */
    readonly rpcError: JsonRpcErrorPayload

    /**
     * @param rpcError JSON-RPC error payload.
     */
    constructor(rpcError: JsonRpcErrorPayload) {
        const detail = rpcError.detail ? ` (${rpcError.detail})` : ''
        super(`JSON-RPC error ${rpcError.code}: ${rpcError.message}${detail}`)
        this.name = 'TustenRpcError'
        this.rpcError = rpcError
    }

    /**
     * Код ошибки.
     *
     * @returns код JSON-RPC.
     */
    get code(): number {
        return this.rpcError.code
    }

    /**
     * Дополнительное описание.
     *
     * @returns detail или `undefined`.
     */
    get detail(): string | undefined {
        return this.rpcError.detail
    }

    /**
     * Дополнительные данные.
     *
     * @returns data или `undefined`.
     */
    get data(): unknown {
        return this.rpcError.data
    }
}
