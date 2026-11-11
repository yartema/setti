import { useState, type JSX, type ReactNode } from 'react'
import { Button } from '../shared/Button'
import { useSlice, useStrictSlice, usePathname, useRouter, Link } from 'setti/client'
import type { UserListSlice } from './Factories/usersList'
import type { UserInfoSlice } from '../User/loaders/userInfo'
import { SettiService } from 'setti'
import { usersService } from './Factories/usersList'

/**
 * Главная страница демо.
 *
 * Демонстрирует:
 *   - `useStrictSlice` — гарантированный слайс (`userInfo` в deps);
 *   - `useSlice` — page-слайс `UserList` (может быть undefined);
 *   - API-запрос через `fetch('/api/ping')`;
 *   - `usePathname` + `useRouter` + `<Link>` для навигации.
 *
 * @returns JSX-элемент.
 */
export function View(): JSX.Element {
    const user = useStrictSlice<UserInfoSlice>('userInfo')
    const userState = user.getState()

    const list = useSlice<UserListSlice>('UserList')
    const listState = list?.getState()

    const path = usePathname()
    const router = useRouter()

    const [apiResult, setApiResult] = useState<string | null>(null)
    const [apiLoading, setApiLoading] = useState(false)

    /**
     * Дёргает `/api/ping` и показывает результат.
     */
    const pingApi = async (): Promise<void> => {
        setApiLoading(true)
        setApiResult(null)
        try {
            const res = await fetch('/api/ping', {
                headers: { Accept: 'application/json' },
            })
            if (!res.ok) {
                setApiResult(`HTTP ${res.status}`)
                return
            }
            const data = (await res.json()) as { method: string; ok: boolean; time: number }
            setApiResult(`${data.method} ok=${data.ok} time=${data.time}`)
        } catch (err) {
            setApiResult(`error: ${(err as Error).message}`)
        } finally {
            setApiLoading(false)
        }
    }

    return (
        <div className="space-y-8">
            <section>
                <h1 className="text-4xl font-bold tracking-tight text-slate-900">setti demo</h1>
                <p className="mt-2 text-slate-600">React 19 · Fastify · Vite · SSR + SPA · Tailwind</p>
            </section>

            <div className="grid gap-5 md:grid-cols-2">
                <Card title="userInfo" badge="useStrictSlice" badgeHint="global · Map + Date">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-lg">
                            👤
                        </div>
                        <div>
                            <p className="font-medium text-slate-900">{userState?.name ?? 'anonymous'}</p>
                            <p className="text-sm text-slate-500">id: {userState?.id ?? '—'}</p>
                            {userState && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Map (permissions): {userState.permissions instanceof Map ? '✓ Map' : '✗ not Map'} (
                                    {userState.permissions?.size ?? 0} items)
                                    <br />
                                    Date (createdAt): {userState.createdAt instanceof Date ? '✓ Date' : '✗ not Date'}
                                </p>
                            )}
                        </div>
                    </div>
                </Card>

                <Card title="UserList" badge="useSlice" badgeHint="page · may be undefined">
                    {listState ? (
                        <div>
                            <p className="text-sm text-slate-500">{listState.total} users, перезагрузить:</p>
                            <button
                                onClick={() => listState.reload()}
                                className="mt-2 rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
                            >
                                reload()
                            </button>
                            <div className="mt-3 flex flex-wrap gap-1">
                                {listState.users.slice(0, 10).map((u) => (
                                    <span
                                        key={u.id}
                                        className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600"
                                    >
                                        #{u.id}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-slate-500">Loading…</p>
                    )}
                </Card>

                <Card title="API request" badge="fetch">
                    <button
                        onClick={pingApi}
                        disabled={apiLoading}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:bg-slate-300"
                    >
                        {apiLoading ? 'Pinging…' : 'Ping /api/ping'}
                    </button>
                    {apiResult && (
                        <code className="mt-3 block rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300">
                            {apiResult}
                        </code>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            onClick={() => {
                                usersService.invalidate()
                                setApiResult('cache invalidated')
                            }}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Invalidate Users cache
                        </button>
                        <button
                            onClick={() => {
                                SettiService.invalidateAll()
                                setApiResult('all cache invalidated')
                            }}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Invalidate ALL
                        </button>
                    </div>
                </Card>

                <Card title="Router" badge="usePathname + useRouter">
                    <p className="text-sm text-slate-500">current path:</p>
                    <code className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-700">
                        {path}
                    </code>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                            href="/about"
                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            → About (Link)
                        </Link>
                        <button
                            onClick={() => void router.push('/about')}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            → About (push)
                        </button>
                        <Link
                            href="/blog/hello"
                            prefetch
                            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                        >
                            → /blog/hello
                        </Link>
                    </div>
                </Card>
                <Button>Кнопка с локальным CSS</Button>
            </div>
        </div>
    )
}

/** Пропсы карточки. */
interface CardProps {
    /** Заголовок. */
    title: string
    /** Бейдж (что используется). */
    badge?: string
    /** Подсказка под бейджем. */
    badgeHint?: string
    /** Содержимое. */
    children: ReactNode
}

/**
 * Карточка-демо.
 *
 * @param props пропсы.
 * @returns JSX-элемент.
 */
function Card(props: CardProps): JSX.Element {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{props.title}</h2>
                {props.badge && (
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-mono text-indigo-700">
                        {props.badge}
                    </span>
                )}
            </div>
            {props.badgeHint && <p className="mb-3 text-xs text-slate-400">{props.badgeHint}</p>}
            {props.children}
        </section>
    )
}
