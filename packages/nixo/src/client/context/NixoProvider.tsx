import {
    createContext,
    createElement,
    useContext,
    useMemo,
    type PropsWithChildren,
    type ReactNode,
} from 'react'
import { NixoError } from '../../errors'
import type { SliceRegistry } from '../slices/SliceRegistry'
import type { NixoClientRouter } from '../../types'

/** Значение контекста nixo (клиент). */
export interface NixoContextValue {
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled из client-entry). */
    router: NixoClientRouter
}

/** Внутренний Context. */
const NixoContext = createContext<NixoContextValue | null>(null)

/** Пропсы провайдера. */
export type NixoProviderProps = PropsWithChildren<{
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled — обновляется через повторный render). */
    router: NixoClientRouter
}>

/**
 * Провайдер фреймворка: прокидывает реестр слайсов и router в дерево React.
 *
 * `router` — **controlled prop**. Не хранит собственный state. При навигации
 * client-entry делает `rootRef.render(<NixoProvider router={newRouter} ...>)`,
 * и `usePathname`/`useParams`/`useQuery` сразу видят новое значение.
 *
 * @param props пропсы.
 * @returns элемент провайдера.
 */
export function NixoProvider(props: NixoProviderProps): ReactNode {
    const value = useMemo<NixoContextValue>(
        () => ({ sliceRegistry: props.sliceRegistry, router: props.router }),
        [props.sliceRegistry, props.router],
    )
    return createElement(NixoContext.Provider, { value }, props.children)
}

/**
 * Достаёт контекст nixo.
 *
 * @returns значение контекста.
 * @throws {NixoError} если провайдера нет.
 */
export function useResourceContext(): NixoContextValue {
    const ctx = useContext(NixoContext)
    if (!ctx) {
        throw new NixoError('useResourceContext must be used within <NixoProvider>')
    }
    return ctx
}