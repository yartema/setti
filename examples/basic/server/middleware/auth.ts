/** Контекст server-auth middleware. */
interface ServerAuthContext {
    router: { path: string }
}

/**
 * Пример server middleware для страниц.
 *
 * @param _params параметры (не используются).
 * @param ctx контекст SSR-рендера.
 */
export default async function auth(
    _params: Record<string, unknown>,
    ctx: ServerAuthContext,
): Promise<void> {
    console.log('[server-auth] check', ctx.router.path)
}