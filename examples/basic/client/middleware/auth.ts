/** Контекст client-auth middleware. */
interface ClientAuthContext {
    to: { path: string }
}

/**
 * Пример client middleware: пускает всех, но логирует.
 *
 * @param _params параметры (не используются).
 * @param ctx контекст навигации.
 */
export default async function auth(
    _params: Record<string, unknown>,
    ctx: ClientAuthContext,
): Promise<void> {
    console.log('[client-auth] allow', ctx.to.path)
}