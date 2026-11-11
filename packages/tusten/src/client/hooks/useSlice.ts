import type { AbstractSlice } from '../slices/AbstractSlice'
import { useSliceInternal } from './useSliceInternal'

/**
 * Подписка на state слайса.
 *
 * Возвращает `undefined`, если слайса нет. Не бросает.
 *
 * @param key имя слайса.
 * @returns слайс или undefined.
 */
export function useSlice<S extends AbstractSlice<unknown>>(key: string): S | undefined {
    return useSliceInternal<S>(key, { observeState: true })
}
