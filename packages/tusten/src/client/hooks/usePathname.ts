import { useResourceContext } from '../context/RootProvider'

/**
 * Текущий путь.
 *
 * @returns pathname.
 */
export function usePathname(): string {
    return useResourceContext().router.path
}
