import type { JSX } from 'react'
import { useSlice, useParams, usePathname, Link } from 'setti/client'
import type { PostSlice } from './Factories/blogPost'

/**
 * Страница поста. Демонстрирует `useParams()` для динамического сегмента.
 *
 * @returns JSX-элемент.
 */
export function View(): JSX.Element {
    const params = useParams()
    const path = usePathname()
    const slice = useSlice<PostSlice>('BlogPost')
    const post = slice?.getState()

    return (
        <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">{post?.title ?? 'Loading…'}</h1>
            <p className="text-slate-600">
                slug: <code className="rounded bg-slate-100 px-1.5 py-0.5">{params.slug}</code>
                {' · '}
                path: <code className="rounded bg-slate-100 px-1.5 py-0.5">{path}</code>
            </p>
            <p className="text-slate-700">{post?.body}</p>
            <div className="flex gap-2">
                <Link
                    href="/"
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    ← Home
                </Link>
                <Link
                    href="/blog/world"
                    prefetch
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    → /blog/world
                </Link>
            </div>
        </div>
    )
}
