import type { ApiRouteContext } from '@tusten/core/server'

/**
 * Пример API-роута: `GET /api/ping`.
 *
 * @param _params статические параметры (не используются).
 * @param ctx контекст Fastify.
 * @returns объект с текущим временем.
 */
export async function ping(_params: Record<string, unknown>, ctx: ApiRouteContext): Promise<unknown> {
    return { ok: true, method: ctx.request.method, time: Date.now() }
}
