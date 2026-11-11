import { createContext, createElement, useContext, useMemo, type PropsWithChildren, type ReactNode } from 'react'
import { TustenError } from '../../errors'
import type { SliceRegistry } from '../slices/SliceRegistry'
import type { TustenClientRouter } from '../../types'

/** Значение контекста tusten (клиент). */
export interface TustenContextValue {
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled из client-entry). */
    router: TustenClientRouter
}

/** Внутренний Context. */
const TustenContext = createContext<TustenContextValue | null>(null)

/** Пропсы провайдера. */
export type RootProviderProps = PropsWithChildren<{
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled — обновляется через повторный render). */
    router: TustenClientRouter
}>

/**
 * Провайдер фреймворка: прокидывает реестр слайсов и router в дерево React.
 *
 * `router` — **controlled prop**. Не хранит собственный state. При навигации
 * client-entry делает `rootRef.render(<RootProvider router={newRouter} ...>)`,
 * и `usePathname`/`useParams`/`useQuery` сразу видят новое значение.
 *
 * @param props пропсы.
 * @returns элемент провайдера.
 */
export function RootProvider(props: RootProviderProps): ReactNode {
    const value = useMemo<TustenContextValue>(
        () => ({ sliceRegistry: props.sliceRegistry, router: props.router }),
        [props.sliceRegistry, props.router],
    )
    return createElement(TustenContext.Provider, { value }, props.children)
}

/**
 * Достаёт контекст tusten.
 *
 * @returns значение контекста.
 * @throws {TustenError} если провайдера нет.
 */
export function useResourceContext(): TustenContextValue {
    const ctx = useContext(TustenContext)
    if (!ctx) {
        throw new TustenError('useResourceContext must be used within <RootProvider>')
    }
    return ctx
}
