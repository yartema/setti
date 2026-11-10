import type { AbstractSlice } from '../slices/AbstractSlice'
import { useSliceInternal } from './useSliceInternal'

/**
 * Подписка только на присутствие слайса (без подписки на state).
 *
 * @param key имя слайса.
 * @returns слайс или undefined.
 */
export function useSliceRef<S extends AbstractSlice<unknown>>(
    key: string,
): S | undefined {
    return useSliceInternal<S>(key, { observeState: false })
}
