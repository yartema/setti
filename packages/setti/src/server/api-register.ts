import path from 'node:path'
import { createJiti } from 'jiti'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ServerPluginDef, ServerRoute } from '../types'
import { SettiError } from '../errors'
import { fileExists } from '../utils/fs'

/** Контекст handler'а API-роута. */
export interface ApiRouteContext {
    /** Fastify-запрос. */
    request: FastifyRequest
    /** Fastify-ответ. */
    reply: FastifyReply
    /** URL-параметры (Fastify `req.params`). */
    params: Record<string, string>
}

/** Контекст API-middleware. */
export interface ApiMiddlewareContext {
    /** Fastify-запрос. */
    request: FastifyRequest
    /** Fastify-ответ. */
    reply: FastifyReply
}

/** Handler API-роута. */
export type ApiRouteHandler = (
    params: Record<string, unknown>,
    ctx: ApiRouteContext,
) => Promise<unknown>

/** Handler API-middleware. */
export type ApiMiddlewareHandler = (
    params: Record<string, unknown>,
    ctx: ApiMiddlewareContext,
) => Promise<unknown>

/**
 * Регистрирует Fastify-плагины из `server/plugins/`.
 *
 * Каждый файл default-экспортирует Fastify-плагин `(fastify, opts) => Promise<void>`.
 *
 * @param fastify Fastify-инстанс.
 * @param plugins загруженные плагины (в нужном порядке).
 * @throws {SettiError} если default-экспорт не функция.
 */
export async function registerServerPlugins(
    fastify: FastifyInstance,
    plugins: ServerPluginDef[],
): Promise<void> {
    const jiti = createJiti(import.meta.url, { interopDefault: true })

    for (const plugin of plugins) {
        const mod = (await jiti.import(plugin.path)) as Record<string, unknown>
        const fn = mod.default
        if (typeof fn !== 'function') {
            throw new SettiError(
                `Fastify plugin "${plugin.name}" at ${plugin.path} must default-export a function`,
            )
        }
        await fastify.register(fn as Parameters<FastifyInstance['register']>[0])
    }
}

/**
 * Регистрирует API-роуты из `server/routes.ts`.
 *
 * Для каждого роута:
 *   1. `preHandler` — цепочка `route.middleware` (если задана).
 *   2. `handler` — загружает `route.handler` и вызывает `(params, ctx)`.
 *
 * Остановка цепочки: если middleware вернул `reply` (identity) —
 * цепочка прерывается, handler не вызывается.
 *
 * @param fastify Fastify-инстанс.
 * @param routes загруженные роуты.
 * @param projectDir корень проекта.
 */
export async function registerServerRoutes(
    fastify: FastifyInstance,
    routes: ServerRoute[],
    projectDir: string,
): Promise<void> {
    const jiti = createJiti(import.meta.url, { interopDefault: true })

    for (const route of routes) {
        fastify.route({
            method: route.method,
            url: route.path,
            async preHandler(request, reply) {
                for (const mw of route.middleware ?? []) {
                    const fn = await loadHandlerFunction(
                        mw.handler,
                        projectDir,
                        jiti,
                        `middleware "${mw.id}"`,
                    )
                    const result = await (fn as ApiMiddlewareHandler)(mw.params ?? {}, {
                        request,
                        reply,
                    })
                    if (result === reply) return reply
                }
            },
            async handler(request, reply) {
                const fn = await loadHandlerFunction(
                    route.handler,
                    projectDir,
                    jiti,
                    `route handler "${route.method} ${route.path}"`,
                )
                const result = await (fn as ApiRouteHandler)(route.params ?? {}, {
                    request,
                    reply,
                    params: (request.params ?? {}) as Record<string, string>,
                })
                if (result === reply) return reply
                return result
            },
        })
    }
}

/**
 * Загружает функцию по спеке (`<file>:<export>` или `<file>` — default).
 *
 * @param spec спека модуля.
 * @param projectDir корень проекта.
 * @param jiti инстанс jiti.
 * @param label описание для ошибок.
 * @returns загруженная функция.
 * @throws {SettiError} если файл не найден или экспорт не функция.
 */
async function loadHandlerFunction(
    spec: string,
    projectDir: string,
    jiti: import('jiti').Jiti,
    label: string,
): Promise<unknown> {
    const [file, exportName] = spec.split(':')
    const base = path.resolve(projectDir, file)
    let abs: string | null = null
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
        if (await fileExists(base + ext)) {
            abs = base + ext
            break
        }
    }
    if (!abs) {
        throw new SettiError(`Module not found for ${label}: ${spec}`)
    }
    const mod = (await jiti.import(abs)) as Record<string, unknown>
    const fn = exportName ? mod[exportName] : mod.default
    if (typeof fn !== 'function') {
        throw new SettiError(
            `Export "${exportName ?? 'default'}" of ${label} at ${abs} is not a function`,
        )
    }
    return fn
}
