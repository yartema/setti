import { useResourceContext } from '../context/SettiProvider'

/** Результат `useRouter`. */
export interface SettiRouterApi {
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
 * Императивные операции роутера.
 *
 * Реализация — в виртуальном client-entry (`window.__settiNavigate`).
 *
 * @returns API роутера.
 */
export function useRouter(): SettiRouterApi {
    const { router: _router } = useResourceContext()
    void _router

    // navigator ставится в client-entry в `window.__settiNavigate`.
    const nav = (globalThis as unknown as {
        __settiNavigate?: {
            push: (path: string) => Promise<void>
            replace: (path: string) => Promise<void>
            back: () => void
            prefetch: (path: string) => Promise<void>
        }
    }).__settiNavigate

    if (!nav) {
        return {
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
    }
    return nav
}