import { useResourceContext } from '../context/SettiProvider'

/**
 * Query-параметры текущего URL.
 *
 * @returns объект `query`.
 */
export function useQuery(): Record<string, string> {
    return useResourceContext().router.query
}
