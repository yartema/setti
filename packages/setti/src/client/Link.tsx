import { createElement, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from './hooks/useRouter'
import { useResourceContext } from './context/SettiProvider'

/** Пропсы `<Link>`. */
export interface LinkProps {
    /** Целевой путь. */
    href: string
    /** Дочерние элементы. */
    children?: ReactNode
    /** Прогревать данные на hover. */
    prefetch?: boolean
    /** CSS-класс. */
    className?: string
}

/**
 * Клиентская ссылка. Перехватывает клик, использует SPA-навигацию.
 *
 * @param props пропсы.
 * @returns `<a>` с перехватом клика.
 */
export function Link(props: LinkProps): ReactNode {
    const { href, children, prefetch, className } = props
    const router = useRouter()
    const ctx = useResourceContext()

    const isActive = ctx.router.path === href

    return createElement(
        'a',
        {
            href,
            className,
            'data-active': isActive ? 'true' : undefined,
            onClick: (e: MouseEvent<HTMLAnchorElement>) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                if (e.defaultPrevented) return
                e.preventDefault()
                void router.push(href)
            },
            onMouseEnter: prefetch
                ? () => {
                    void router.prefetch(href)
                }
                : undefined,
        },
        children,
    )
}