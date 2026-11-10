import type { JSX } from 'react'
import { useStrictSlice, Link } from 'nixo/client'
import type { UserInfoSlice } from '../User/loaders/userInfo'

/**
 * Админ-панель. Демонстрация вложенного layout (Main → Admin → View).
 *
 * @returns JSX-элемент.
 */
export function View(): JSX.Element {
    const user = useStrictSlice<UserInfoSlice>('userInfo')
    const info = user.getState()

    return (
        <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
    <p className="text-sm text-slate-600">
        Привет, <strong>{info?.name ?? 'guest'}</strong>. Это вложенная
    страница: <code className="rounded bg-slate-100 px-1.5 py-0.5">Main</code>{' '}
        → <code className="rounded bg-slate-100 px-1.5 py-0.5">Admin</code>{' '}
        → <code className="rounded bg-slate-100 px-1.5 py-0.5">AdminPage.view</code>.
        </p>
        <Link
    href="/"
    className="inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
        ← Home
    </Link>
    </div>
)
}