import { useResourceContext } from '../context/RootProvider'

/**
 * Query-параметры текущего URL.
 *
 * @returns объект `query`.
 */
export function useQuery(): Record<string, string> {
    return useResourceContext().router.query
}
