// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Slice } from './slices/Slice'
import { SliceRegistry } from './slices/SliceRegistry'
import { SettiProvider } from './context/SettiProvider'
import { useSlice } from './hooks/useSlice'
import { useStrictSlice } from './hooks/useStrictSlice'
import { useSliceRef } from './hooks/useSliceRef'
import { usePathname } from './hooks/usePathname'
import { useParams } from './hooks/useParams'
import { useQuery } from './hooks/useQuery'
import { useRouter } from './hooks/useRouter'
import { Link } from './Link'
import type { SettiClientRouter } from '../types'

/** Тестовый слайс. */
class CounterSlice extends Slice<number> {}

/**
 * Обёртка с провайдером.
 *
 * @param props.children дочерние.
 * @param props.registry реестр слайсов.
 * @param props.router router (path/params/query/routeId).
 * @param props
 * @returns JSX.
 */
function Wrapper(props: { children: ReactNode; registry: SliceRegistry; router?: Partial<SettiClientRouter> }) {
    const router: SettiClientRouter = {
        path: '/',
        params: {},
        query: {},
        routeId: 'home',
        ...props.router,
    }
    return (
        <SettiProvider sliceRegistry={props.registry} router={router}>
            {props.children}
        </SettiProvider>
    )
}

describe('React hooks', () => {
    let registry: SliceRegistry

    beforeEach(() => {
        registry = new SliceRegistry()
        ;(globalThis as { __settiNavigate?: unknown }).__settiNavigate = {
            push: vi.fn(async () => undefined),
            replace: vi.fn(async () => undefined),
            back: vi.fn(),
            prefetch: vi.fn(async () => undefined),
        }
    })

    afterEach(() => {
        cleanup()
        delete (globalThis as { __settiNavigate?: unknown }).__settiNavigate
    })

    describe('useSlice', () => {
        it('undefined, если слайса нет', () => {
            const { result } = renderHook(() => useSlice('nope'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBeUndefined()
        })

        it('возвращает слайс и его state', () => {
            const slice = new CounterSlice()
            slice.hydrate(42)
            registry.setPage('counter', slice)
            const { result } = renderHook(() => useSlice<CounterSlice>('counter'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBe(slice)
            expect(result.current?.getState()).toBe(42)
        })

        it('rerender на setState', () => {
            const slice = new CounterSlice()
            slice.hydrate(0)
            registry.setPage('counter', slice)

            /**
             *
             */
            function Test() {
                const s = useSlice<CounterSlice>('counter')
                return <span data-testid="v">{s?.getState()}</span>
            }

            const { getByTestId } = render(
                <Wrapper registry={registry}>
                    <Test />
                </Wrapper>,
            )
            expect(getByTestId('v').textContent).toBe('0')

            act(() => {
                slice.setState(7)
            })
            expect(getByTestId('v').textContent).toBe('7')
        })

        it('пересоздание слайса по key (dispose + set)', () => {
            const sliceA = new CounterSlice()
            sliceA.hydrate(1)
            registry.setPage('c', sliceA)

            const { result } = renderHook(() => useSlice<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current?.getState()).toBe(1)

            const sliceB = new CounterSlice()
            sliceB.hydrate(2)
            registry.setPage('c', sliceB)

            // Перепроверить через renderHook
            const { result: r2 } = renderHook(() => useSlice<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(r2.current?.getState()).toBe(2)
        })
    })

    describe('useStrictSlice', () => {
        it('бросает, если слайса нет', () => {
            expect(() =>
                renderHook(() => useStrictSlice('nope'), {
                    wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
                }),
            ).toThrow()
        })

        it('возвращает слайс', () => {
            const slice = new CounterSlice()
            slice.hydrate(5)
            registry.setPage('c', slice)
            const { result } = renderHook(() => useStrictSlice<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBe(slice)
        })
    })

    describe('useSliceRef', () => {
        it('undefined, если нет', () => {
            const { result } = renderHook(() => useSliceRef('nope'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBeUndefined()
        })

        it('возвращает слайс', () => {
            const slice = new CounterSlice()
            slice.hydrate(0)
            registry.setPage('c', slice)
            const { result } = renderHook(() => useSliceRef<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBe(slice)
        })
    })

    describe('usePathname / useParams / useQuery', () => {
        it('usePathname', () => {
            const { result } = renderHook(() => usePathname(), {
                wrapper: ({ children }) => (
                    <Wrapper registry={registry} router={{ path: '/blog/hello' }}>
                        {children}
                    </Wrapper>
                ),
            })
            expect(result.current).toBe('/blog/hello')
        })

        it('useParams', () => {
            const { result } = renderHook(() => useParams(), {
                wrapper: ({ children }) => (
                    <Wrapper registry={registry} router={{ params: { slug: 'hello' } }}>
                        {children}
                    </Wrapper>
                ),
            })
            expect(result.current).toEqual({ slug: 'hello' })
        })

        it('useQuery', () => {
            const { result } = renderHook(() => useQuery(), {
                wrapper: ({ children }) => (
                    <Wrapper registry={registry} router={{ query: { tab: 'x' } }}>
                        {children}
                    </Wrapper>
                ),
            })
            expect(result.current).toEqual({ tab: 'x' })
        })

        it('смена router prop — usePathname обновляется', () => {
            /**
             *
             */
            function Inner() {
                return <span data-testid="p">{usePathname()}</span>
            }
            /**
             *
             * @param root0
             * @param root0.path
             */
            function Test({ path }: { path: string }) {
                return (
                    <SettiProvider sliceRegistry={registry} router={{ path, params: {}, query: {}, routeId: 'x' }}>
                        <Inner />
                    </SettiProvider>
                )
            }

            const { getByTestId, rerender } = render(<Test path="/a" />)
            expect(getByTestId('p').textContent).toBe('/a')
            rerender(<Test path="/b" />)
            expect(getByTestId('p').textContent).toBe('/b')
        })
    })

    describe('useRouter', () => {
        it('push', async () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            await result.current.push('/about')
            const nav = (globalThis as { __settiNavigate?: { push: ReturnType<typeof vi.fn> } }).__settiNavigate!
            expect(nav.push).toHaveBeenCalledWith('/about')
        })

        it('replace', async () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            await result.current.replace('/x')
            const nav = (globalThis as { __settiNavigate?: { replace: ReturnType<typeof vi.fn> } }).__settiNavigate!
            expect(nav.replace).toHaveBeenCalledWith('/x')
        })

        it('back', () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            result.current.back()
            const nav = (globalThis as { __settiNavigate?: { back: ReturnType<typeof vi.fn> } }).__settiNavigate!
            expect(nav.back).toHaveBeenCalled()
        })

        it('prefetch', async () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            await result.current.prefetch('/about')
            const nav = (globalThis as { __settiNavigate?: { prefetch: ReturnType<typeof vi.fn> } }).__settiNavigate!
            expect(nav.prefetch).toHaveBeenCalledWith('/about')
        })
    })

    describe('<Link>', () => {
        it('рендерит <a> с href и className', () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about" className="nav-link">
                        About
                    </Link>
                </Wrapper>,
            )
            const a = container.querySelector('a')!
            expect(a.getAttribute('href')).toBe('/about')
            expect(a.className).toBe('nav-link')
            expect(a.textContent).toBe('About')
        })

        it('click вызывает push', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about">About</Link>
                </Wrapper>,
            )
            fireEvent.click(container.querySelector('a')!)
            await new Promise((r) => setTimeout(r, 0))
            const nav = (globalThis as { __settiNavigate?: { push: ReturnType<typeof vi.fn> } }).__settiNavigate!
            expect(nav.push).toHaveBeenCalledWith('/about')
        })

        it('Ctrl+Click не перехватывается', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about">About</Link>
                </Wrapper>,
            )
            fireEvent.click(container.querySelector('a')!, { ctrlKey: true })
            await new Promise((r) => setTimeout(r, 0))
            const nav = (globalThis as { __settiNavigate?: { push: ReturnType<typeof vi.fn> } }).__settiNavigate!
            expect(nav.push).not.toHaveBeenCalled()
        })

        it('prefetch on hover', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about" prefetch>
                        About
                    </Link>
                </Wrapper>,
            )
            fireEvent.mouseOver(container.querySelector('a')!)
            await new Promise((r) => setTimeout(r, 0))
            const nav = (
                globalThis as {
                    __settiNavigate?: { prefetch: ReturnType<typeof vi.fn> }
                }
            ).__settiNavigate!
            expect(nav.prefetch).toHaveBeenCalledWith('/about')
        })

        it('без prefetch — hover не вызывает prefetch', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about">About</Link>
                </Wrapper>,
            )
            fireEvent.mouseOver(container.querySelector('a')!)
            await new Promise((r) => setTimeout(r, 0))
            const nav = (
                globalThis as {
                    __settiNavigate?: { prefetch: ReturnType<typeof vi.fn> }
                }
            ).__settiNavigate!
            expect(nav.prefetch).not.toHaveBeenCalled()
        })
    })
})
