import type { JSX } from 'react'

/** Пропсы. */
interface ErrorBoundaryProps {
    /** Ошибка. */
    error: Error
}

/**
 * Кастомный fallback для ErrorBoundary.
 *
 * @param props пропсы.
 * @returns JSX-элемент.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element {
    return (
        <div className="rounded-xl border border-red-300 bg-red-50 p-5">
            <h2 className="text-lg font-semibold text-red-700">
                Что-то пошло не так
            </h2>
            <p className="mt-1 text-sm text-red-600">{props.error.message}</p>
            <button
                onClick={() => window.location.reload()}
                className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
                Перезагрузить
            </button>
        </div>
    )
}
