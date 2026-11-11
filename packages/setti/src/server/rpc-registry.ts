import { SettiError } from '../errors'
import type { RpcMethodDefinition, RpcObjectDefinition } from '../types'

/** Зарегистрированный RPC-метод (объект + метод + полное имя). */
export interface RpcRegisteredMethod {
    /** Родительский объект. */
    object: RpcObjectDefinition
    /** Имя метода (`List`, `Read`, ...). */
    methodName: string
    /** Полное имя (`Users.List`). */
    fullName: string
    /** Определение метода. */
    method: RpcMethodDefinition<unknown, unknown>
}

/** Имя объекта/метода: `[A-Za-z][A-Za-z0-9_]*`. */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * Реестр RPC-объектов и методов.
 *
 * Собирается сканером из `server/*.meta.ts`. Валидирует имена,
 * уникальность, наличие handler'а.
 *
 * Используется:
 *   - в `/service` (R3) — для диспетчеризации JSON-RPC;
 *   - в `ctx.call` (R6) — для прямого вызова handler'а.
 */
export class RpcRegistry {
    /** Объекты по имени. */
    private objects = new Map<string, RpcObjectDefinition>()

    /** Методы по полному имени (`Users.List`). */
    private methods = new Map<string, RpcRegisteredMethod>()

    /**
     * Регистрирует объект БЛ.
     *
     * Валидация:
     *   - `name` соответствует `[A-Za-z][A-Za-z0-9_]*`;
     *   - `name` уникален;
     *   - каждый `methodName` соответствует `[A-Za-z][A-Za-z0-9_]*`;
     *   - `handler` — функция;
     *   - полное имя (`${name}.${methodKey}`) уникально.
     *
     * @param obj определение объекта.
     * @throws {SettiError} при любой валидационной ошибке.
     */
    add(obj: RpcObjectDefinition): void {
        if (!NAME_RE.test(obj.name)) {
            throw new SettiError(
                `Invalid RPC object name "${obj.name}": must match [A-Za-z][A-Za-z0-9_]*`,
            )
        }
        if (this.objects.has(obj.name)) {
            throw new SettiError(`Duplicate RPC object "${obj.name}"`)
        }

        // Сначала валидируем все методы, потом регистрируем — чтобы при ошибке
        // не оставить реестр в полу-заполненном состоянии.
        for (const [methodName, method] of Object.entries(obj.methods)) {
            if (!NAME_RE.test(methodName)) {
                throw new SettiError(
                    `Invalid RPC method name "${obj.name}.${methodName}": must match [A-Za-z][A-Za-z0-9_]*`,
                )
            }
            if (typeof method.handler !== 'function') {
                throw new SettiError(
                    `RPC method "${obj.name}.${methodName}": handler is not a function`,
                )
            }
            const fullName = `${obj.name}.${methodName}`
            if (this.methods.has(fullName)) {
                throw new SettiError(`Duplicate RPC method "${fullName}"`)
            }
        }

        this.objects.set(obj.name, obj)
        for (const [methodName, method] of Object.entries(obj.methods)) {
            const fullName = `${obj.name}.${methodName}`
            this.methods.set(fullName, { object: obj, methodName, fullName, method })
        }
    }

    /**
     * Объект по имени.
     *
     * @param name имя объекта.
     * @returns определение или `undefined`.
     */
    get(name: string): RpcObjectDefinition | undefined {
        return this.objects.get(name)
    }

    /**
     * Метод по полному имени.
     *
     * @param fullName полное имя (`Users.List`).
     * @returns зарегистрированный метод или `undefined`.
     */
    getMethod(fullName: string): RpcRegisteredMethod | undefined {
        return this.methods.get(fullName)
    }

    /**
     * Список полных имён методов (server-only).
     *
     * @returns массив имён.
     */
    listMethods(): string[] {
        return [...this.methods.keys()]
    }

    /**
     * Список объектов.
     *
     * @returns массив определений.
     */
    listObjects(): RpcObjectDefinition[] {
        return [...this.objects.values()]
    }

    /**
     * Количество зарегистрированных объектов.
     *
     * @returns число объектов.
     */
    get size(): number {
        return this.objects.size
    }

    /**
     * Описание всех зарегистрированных объектов и методов.
     *
     * Возвращает данные для JSON-RPC `System.Describe`: имена, описания,
     * наличие `params`, требования `auth`, флаг `internal`. **Handler'ы не
     * сериализуются** — только метаданные.
     *
     * @returns объект описания.
     */
    describe(): {
        objects: Array<{
            name: string
            description: string | null
            meta: Record<string, unknown>
            methods: Array<{
                name: string
                fullName: string
                description: string | null
                hasParams: boolean
                auth: 'public' | 'user' | { roles: string[] }
                internal: boolean
                meta: Record<string, unknown>
            }>
        }>
    } {
        const result: ReturnType<RpcRegistry['describe']> = { objects: [] }

        for (const obj of this.objects.values()) {
            const methods: Array<{
                name: string
                fullName: string
                description: string | null
                hasParams: boolean
                auth: 'public' | 'user' | { roles: string[] }
                internal: boolean
                meta: Record<string, unknown>
            }> = []

            for (const [methodName, method] of Object.entries(obj.methods)) {
                let auth: 'public' | 'user' | { roles: string[] } = 'public'
                if (method.auth === true) auth = 'user'
                else if (method.auth && typeof method.auth === 'object' && 'roles' in method.auth) {
                    auth = { roles: method.auth.roles }
                }

                methods.push({
                    name: methodName,
                    fullName: `${obj.name}.${methodName}`,
                    description: method.description ?? null,
                    hasParams: method.params !== undefined,
                    auth,
                    internal: method.internal === true,
                    meta: method.meta ?? {},
                })
            }

            result.objects.push({
                name: obj.name,
                description: obj.description ?? null,
                meta: obj.meta ?? {},
                methods,
            })
        }

        return result
    }
}
