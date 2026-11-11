import type { JSX } from 'react'
import { Link, usePathname } from '@tusten/core/client'

/**
 * Кастомная 404.
 *
 * @returns JSX-элемент.
 */
export function NotFound(): JSX.Element {
    const path = usePathname()

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-center">
            <h1 className="text-6xl font-bold text-slate-900">404</h1>
            <p className="mt-2 text-slate-600">Страница не найдена</p>
            <code className="mt-2 rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-500">{path}</code>
            <Link
                href="/"
                className="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                ← Home
            </Link>
        </div>
    )
}
