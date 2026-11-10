import { createElement, type ReactNode } from 'react'

/**
 * Дефолтный индикатор загрузки (показывается во время первого SPA-prefetch).
 *
 * @returns ReactNode.
 */
export function NixoLoading(): ReactNode {
    return createElement(
        'div',
        {
            style: {
                padding: '1rem',
                color: '#666',
                fontFamily: 'system-ui, sans-serif',
            },
        },
        'Loading…',
    )
}
