/**
 * Глобальный logger-middleware (server-side).
 *
 * @param _params параметры (не используются).
 * @param ctx серверный контекст (`router`, `route`, `globalSlices`).
 */
export async function server(_params: Record<string, unknown>, ctx: Record<string, unknown>): Promise<void> {
    const router = ctx.router as { path: string } | undefined
    console.log('[tusten-server-logger]', router?.path ?? '?')
}

/**
 * Глобальный logger-middleware (client-side).
 *
 * @param _params параметры (не используются).
 * @param ctx клиентский контекст (`to`, `from`).
 */
export async function client(_params: Record<string, unknown>, ctx: Record<string, unknown>): Promise<void> {
    const to = ctx.to as { path: string }
    const from = ctx.from as { path: string }
    console.log('[tusten-client-logger]', from.path, '→', to.path)
}
