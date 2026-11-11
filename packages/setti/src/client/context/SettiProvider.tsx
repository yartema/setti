import {
    createContext,
    createElement,
    useContext,
    useMemo,
    type PropsWithChildren,
    type ReactNode,
} from 'react'
import { SettiError } from '../../errors'
import type { SliceRegistry } from '../slices/SliceRegistry'
import type { SettiClientRouter } from '../../types'

/** Значение контекста setti (клиент). */
export interface SettiContextValue {
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled из client-entry). */
    router: SettiClientRouter
}

/** Внутренний Context. */
const SettiContext = createContext<SettiContextValue | null>(null)

/** Пропсы провайдера. */
export type SettiProviderProps = PropsWithChildren<{
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled — обновляется через повторный render). */
    router: SettiClientRouter
}>

/**
 * Провайдер фреймворка: прокидывает реестр слайсов и router в дерево React.
 *
 * `router` — **controlled prop**. Не хранит собственный state. При навигации
 * client-entry делает `rootRef.render(<SettiProvider router={newRouter} ...>)`,
 * и `usePathname`/`useParams`/`useQuery` сразу видят новое значение.
 *
 * @param props пропсы.
 * @returns элемент провайдера.
 */
export function SettiProvider(props: SettiProviderProps): ReactNode {
    const value = useMemo<SettiContextValue>(
        () => ({ sliceRegistry: props.sliceRegistry, router: props.router }),
        [props.sliceRegistry, props.router],
    )
    return createElement(SettiContext.Provider, { value }, props.children)
}

/**
 * Достаёт контекст setti.
 *
 * @returns значение контекста.
 * @throws {SettiError} если провайдера нет.
 */
export function useResourceContext(): SettiContextValue {
    const ctx = useContext(SettiContext)
    if (!ctx) {
        throw new SettiError('useResourceContext must be used within <SettiProvider>')
    }
    return ctx
}