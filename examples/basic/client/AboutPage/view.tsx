import type { JSX, ReactNode } from 'react'
import {
    useSlice,
    useStrictSlice,
    usePathname,
    useQuery,
    useParams,
    useRouter,
    Link,
} from 'nixo/client'
import type { UserInfoSlice } from '../User/loaders/userInfo'
import type { StatsSlice } from './Factories/stats'
import './view.css'

/**
 * Страница About.
 *
 * Демонстрирует:
 *   - `useQuery` + навигацию через `useRouter.push('/about?tab=...')`;
 *   - `useParams` (пусто — динамические сегменты в Phase 2.5);
 *   - `useRouter.back()`.
 *
 * @returns JSX-элемент.
 */
export function View(): JSX.Element {
    const user = useStrictSlice<UserInfoSlice>('userInfo')
    const stats = useSlice<StatsSlice>('AboutStats')

    const path = usePathname()
    const query = useQuery()
    const params = useParams()
    const router = useRouter()

    const tab = query.tab ?? 'info'

    return (
        <div className="space-y-6">
            <section>
                <h1 className="text-4xl font-bold tracking-tight text-slate-900">About</h1>
                <p className="mt-2 text-slate-600">
                    Демонстрация query-навигации, tabs и второго page-слайса.
                </p>
            </section>

            <div className="flex gap-2 border-b border-slate-200">
                <Tab active={tab === 'info'} onClick={() => void router.push('/about?tab=info')}>
                    Info
                </Tab>
                <Tab active={tab === 'features'} onClick={() => void router.push('/about?tab=features')}>
                    Features
                </Tab>
                <Tab active={tab === 'router'} onClick={() => void router.push('/about?tab=router')}>
                    Router
                </Tab>
            </div>

            {tab === 'info' && (
                <div className="grid gap-5 md:grid-cols-2">
                    <Card title="userInfo" badge="global">
                        <p className="text-slate-700">
                            Привет, <strong>{user.getState()?.name ?? 'guest'}</strong>!
                        </p>
                    </Card>
                    <Card title="AboutStats" badge="page">
                        {stats ? (
                            <ul className="space-y-1 text-slate-700">
                                <li>
                                    routes: <strong>{stats.getState().routes}</strong>
                                </li>
                                <li>
                                    slices: <strong>{stats.getState().slices}</strong>
                                </li>
                                <li>
                                    стек:{' '}
                                    <span className="font-mono text-sm">
                    {stats.getState().frameworks.join(' · ')}
                  </span>
                                </li>
                            </ul>
                        ) : (
                            <p className="text-slate-500">Loading…</p>
                        )}
                    </Card>
                </div>
            )}

            {tab === 'features' && (
                <Card title="Что уже работает" badge="roadmap">
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {[
                            'SSR (renderToPipeableStream)',
                            'Hydration + state match',
                            'SPA (?noSSR=true)',
                            'useSlice / useStrictSlice',
                            'Client + server middleware',
                            'API routes (Fastify)',
                            'Prefetch pipeline',
                            'Prod build (nixo build/start)',
                            'Tailwind v4',
                            'Link / router.push / back',
                        ].map((f) => (
                            <li key={f} className="flex items-center gap-2 text-slate-700">
                                <span className="nixo-pulse text-emerald-500">●</span>
                                {f}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {tab === 'router' && (
                <Card title="Состояние роутера" badge="usePathname · useQuery · useParams">
                    <dl className="space-y-3 text-sm">
                        <Row label="path" value={<code>{path}</code>} />
                        <Row label="query" value={<code>{JSON.stringify(query)}</code>} />
                        <Row label="params" value={<code>{JSON.stringify(params)}</code>} />
                    </dl>
                    <p className="mt-4 text-xs text-slate-500">
                        Меняйте вкладки — URL обновляется через `router.push('/about?tab=…')`.
                    </p>
                </Card>
            )}

            <div className="flex flex-wrap gap-3">
                <button
                    onClick={() => router.back()}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    ← Back
                </button>
                <Link
                    href="/"
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    ← Home
                </Link>
            </div>
        </div>
    )
}

/** Пропсы `Tab`. */
interface TabProps {
    /** Активна ли. */
    active: boolean
    /** Клик. */
    onClick: () => void
    /** Текст. */
    children: ReactNode
}

/**
 * Вкладка.
 *
 * @param props пропсы.
 * @returns JSX-элемент.
 */
function Tab(props: TabProps): JSX.Element {
    return (
        <button
            onClick={props.onClick}
            className={
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ' +
                (props.active
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900')
            }
        >
            {props.children}
        </button>
    )
}

/** Пропсы `Card`. */
interface CardProps {
    /** Заголовок. */
    title: string
    /** Бейдж. */
    badge?: string
    /** Содержимое. */
    children: ReactNode
}

/**
 * Карточка.
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
            {props.children}
        </section>
    )
}

/** Пропсы `Row`. */
interface RowProps {
    /** Метка. */
    label: string
    /** Значение. */
    value: ReactNode
}

/**
 * Строка `dl` для списка.
 *
 * @param props пропсы.
 * @returns JSX-элемент.
 */
function Row(props: RowProps): JSX.Element {
    return (
        <div className="flex gap-3">
            <dt className="w-16 shrink-0 font-mono text-slate-500">{props.label}</dt>
            <dd className="text-slate-700 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
                {props.value}
            </dd>
        </div>
    )
}