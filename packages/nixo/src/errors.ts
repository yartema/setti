/**
 * Базовый класс ошибок фреймворка nixo.
 *
 * Все ошибки, которые может бросить сканнер, валидатор или сам фреймворк,
 * наследуются от `NixoError` — это позволяет вызывающему коду отличать
 * ошибки фреймворка от случайных исключений.
 */
export class NixoError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'NixoError'
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
export class NixoRpcError extends NixoError {
    /** Оригинальный JSON-RPC error. */
    readonly rpcError: JsonRpcErrorPayload

    /**
     * @param rpcError JSON-RPC error payload.
     */
    constructor(rpcError: JsonRpcErrorPayload) {
        const detail = rpcError.detail ? ` (${rpcError.detail})` : ''
        super(`JSON-RPC error ${rpcError.code}: ${rpcError.message}${detail}`)
        this.name = 'NixoRpcError'
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
