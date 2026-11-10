import { useResourceContext } from '../context/NixoProvider'

/**
 * Текущий путь.
 *
 * @returns pathname.
 */
export function usePathname(): string {
    return useResourceContext().router.path
}
