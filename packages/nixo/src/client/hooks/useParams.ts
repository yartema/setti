import { useResourceContext } from '../context/NixoProvider'

/**
 * Динамические сегменты текущего маршрута (Phase 2.5, пока `{}`).
 *
 * @returns объект `params`.
 */
export function useParams(): Record<string, string> {
    return useResourceContext().router.params
}
