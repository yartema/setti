import { createElement, type ReactNode } from 'react'

/**
 * Дефолтная 404-страница (если `config.components.notFound` не задан).
 *
 * @returns ReactNode.
 */
export function SettiNotFound(): ReactNode {
    return createElement(
        'div',
        {
            style: {
                padding: '3rem 1rem',
                textAlign: 'center',
                fontFamily: 'system-ui, sans-serif',
            },
        },
        createElement('h1', { style: { fontSize: '3rem', margin: 0 } }, '404'),
        createElement('p', { style: { color: '#666' } }, 'Page not found'),
    )
}
