import type { JSX, ReactNode } from 'react'
import { Link, Outlet, usePathname } from 'nixo/client';

/**
 * Основной layout: header с навигацией, main, footer.
 * @returns JSX-элемент.
 */
export default function Main(): JSX.Element {
    return (
        <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
            <Header />
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                <Outlet />
            </main>
            <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
                nixo · React 19 · Fastify · Vite
            </footer>
        </div>
    )
}

/**
 * Шапка с логотипом и навигацией.
 *
 * @returns JSX-элемент.
 */
function Header(): JSX.Element {
    return (
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-sm font-mono text-white">
            nixo
          </span>
                    <span className="text-slate-700">demo</span>
                </Link>
                <nav className="flex gap-1">
                    <NavLink href="/">Home</NavLink>
                    <NavLink href="/about">About</NavLink>
                    <NavLink href="/blog/hello">Blog</NavLink>
                    <NavLink href="/admin">Admin</NavLink>
                </nav>
            </div>
        </header>
    )
}

/** Пропсы `NavLink`. */
interface NavLinkProps {
    /** Целевой путь. */
    href: string
    /** Текст. */
    children: ReactNode
}

/**
 * Навигационная ссылка с active-состоянием.
 *
 * @param props пропсы.
 * @returns JSX-элемент.
 */
function NavLink(props: NavLinkProps): JSX.Element {
    const path = usePathname()
    const isActive = path === props.href

    return (
        <Link
            href={props.href}
            className={
                'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
                (isActive
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
            }
        >
            {props.children}
        </Link>
    )
}