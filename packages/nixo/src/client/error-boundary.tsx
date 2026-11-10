import {
    Component,
    createElement,
    type ComponentType,
    type ReactNode,
} from 'react'

/** Пропсы `NixoErrorBoundary`. */
export interface NixoErrorBoundaryProps {
    children?: ReactNode
    /** Fallback-компонент, получает `{ error }`. */
    fallback?: ComponentType<{ error: Error }>
}

/** Состояние. */
interface NixoErrorBoundaryState {
    error: Error | null
}

/**
 * Error Boundary фреймворка. Оборачивает дерево страницы.
 *
 * Работает в SSR (`renderToPipeableStream` ловит ошибки через boundary)
 * и на клиенте. Если `fallback` не задан — минимальная заглушка.
 */
export class NixoErrorBoundary extends Component<
    NixoErrorBoundaryProps,
    NixoErrorBoundaryState
> {
    state: NixoErrorBoundaryState = { error: null }

    /**
     * @param error ошибка из дочернего дерева.
     * @returns новое состояние.
     */
    static getDerivedStateFromError(error: Error): NixoErrorBoundaryState {
        return { error }
    }

    /**
     * Логирует ошибку.
     *
     * @param error ошибка.
     * @param info React error info.
     */
    componentDidCatch(error: Error, info: unknown): void {
        console.error('[nixo] error boundary caught:', error, info)
    }

    /**
     * Рендер: fallback при ошибке, иначе `children`.
     *
     * @returns ReactNode.
     */
    render(): ReactNode {
        if (this.state.error) {
            const Fallback = this.props.fallback
            if (Fallback) {
                return createElement(Fallback, { error: this.state.error })
            }
            return createElement(
                'div',
                {
                    style: {
                        padding: '1rem',
                        color: 'crimson',
                        fontFamily: 'system-ui, sans-serif',
                    },
                },
                'Error: ' + this.state.error.message,
            )
        }
        return this.props.children
    }
}