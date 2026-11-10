import type { JSX } from 'react'
import { Outlet } from 'nixo/client'

/**
 * Вложенный layout для админки. Оборачивает страницу в `Main`.
 *
 * @returns JSX-элемент.
 */
export default function Admin(): JSX.Element {
    return (
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <aside className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-4">
                <p className="mb-2 text-xs font-mono text-indigo-500">admin layout</p>
                <ul className="space-y-1 text-sm text-indigo-900">
                    <li>• dashboard</li>
                    <li>• users</li>
                    <li>• settings</li>
                </ul>
            </aside>
            <section className="rounded-xl border-2 border-dashed border-indigo-300 bg-white p-5">
                <Outlet />
            </section>
        </div>
    )
}
