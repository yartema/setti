/** Результат `useRouter` и `getRouter`. */
export interface TustenRouterApi {
    /** Перейти на путь, добавить в history. */
    push: (path: string) => Promise<void>
    /** Заменить текущий путь без записи в history. */
    replace: (path: string) => Promise<void>
    /** Назад. */
    back: () => void
    /** Прогреть данные для маршрута (без навигации). */
    prefetch: (path: string) => Promise<void>
}

/**
 * Запасной навигатор до инициализации client-entry.
 *
 * Использует полную перезагрузку, а не SPA-переход. На сервере `window` нет,
 * поэтому все методы — no-op.
 */
const fallbackRouter: TustenRouterApi = {
    push: async (p) => {
        if (typeof window !== 'undefined') window.location.href = p
    },
    replace: async (p) => {
        if (typeof window !== 'undefined') window.location.replace(p)
    },
    back: () => {
        if (typeof window !== 'undefined') window.history.back()
    },
    prefetch: async () => undefined,
}

/**
 * Навигатор без React-контекста: работает в обработчиках, сервисах и таймерах.
 *
 * Реализацию ставит client-entry в `globalThis.__rootNavigate`. Используется
 * `globalThis`, а не модульная переменная: при двух инстансах `tusten/client`
 * (SSR-бандл и клиент) модульное состояние расходится, а `globalThis` общий.
 *
 * @returns API роутера.
 */
export function getRouter(): TustenRouterApi {
    return (globalThis as { __rootNavigate?: TustenRouterApi }).__rootNavigate ?? fallbackRouter
}

/**
 * Хук для компонентов — обёртка над `getRouter`. Не требует `<RootProvider>`.
 *
 * @returns API роутера.
 */
export function useRouter(): TustenRouterApi {
    return getRouter()
}
