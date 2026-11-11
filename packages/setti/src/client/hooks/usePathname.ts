import { useResourceContext } from '../context/SettiProvider'

/**
 * Текущий путь.
 *
 * @returns pathname.
 */
export function usePathname(): string {
    return useResourceContext().router.path
}
