import { createContext, createElement, useContext, type ComponentType, type ReactNode } from 'react'

/** Контекст `<Outlet/>`: содержит дочерний ReactNode. */
const OutletContext = createContext<ReactNode>(null)

/**
 * Slot для дочернего контента во вложенных layouts.
 *
 * Альтернатива `props.children`: layout может рендерить `<Outlet/>`
 * вместо `{children}`. Оба варианта работают одновременно.
 *
 * @returns дочерний элемент или `null`.
 */
export function Outlet(): ReactNode {
    return useContext(OutletContext)
}

/**
 * Провайдер для `<Outlet/>`. Используется внутренне `renderLayoutChain`.
 *
 * @param props пропсы.
 * @param props.content дочерний ReactNode (то, что увидит `<Outlet/>`).
 * @param props.children сам layout (передаётся как React children).
 * @returns элемент-обёртка.
 */
export function OutletProvider(props: { content: ReactNode; children?: ReactNode }): ReactNode {
    return createElement(OutletContext.Provider, { value: props.content }, props.children)
}

/**
 * Оборачивает страницу цепочкой layouts.
 *
 * `layouts` — от root к leaf. Каждый получает и `children` (следующий
 * уровень), и контекст для `<Outlet/>`.
 *
 * @param page страница (или компонент `<Template/>`).
 * @param layouts цепочка layouts (root → leaf).
 * @returns вложенный ReactNode.
 */
export function renderLayoutChain(page: ReactNode, layouts: ComponentType[]): ReactNode {
    let node = page
    for (let i = layouts.length - 1; i >= 0; i--) {
        const Layout = layouts[i]
        node = createElement(OutletProvider, { content: node }, createElement(Layout, null, node))
    }
    return node
}
