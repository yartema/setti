import type { JSX } from 'react'
import './Button.css'

/** Пропсы. */
interface ButtonProps {
    children: React.ReactNode
}

/**
 * Кнопка с локальным CSS — демонстрация рекурсивного CSS-scan.
 *
 * @param props пропсы.
 * @returns JSX-элемент.
 */
export function Button(props: ButtonProps): JSX.Element {
    return <button className="nixo-btn">{props.children}</button>
}
