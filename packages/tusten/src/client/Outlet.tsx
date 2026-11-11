import type { ReactNode } from 'react'

/** Пропсы `<Outlet/>`. */
export interface OutletProps {
    /** Что рендерить, если дети не переданы. */
    fallback?: ReactNode
}

/**
 * Заглушка для вложенных layouts (Phase 2.6).
 *
 * В Шаге 2 рендерится только один layout, поэтому `<Outlet/>` — no-op.
 * В Шаге 4 цепочка `parentId → ... → template` будет рендерить
 * `<Outlet/>` вместо финального компонента.
 *
 * @param props пропсы.
 * @returns `fallback` или `null`.
 */
export function Outlet(props: OutletProps): ReactNode {
    return props.fallback ?? null
}
