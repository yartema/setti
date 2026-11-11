import type { AbstractSlice } from '../slices/AbstractSlice'
import { useSliceInternal } from './useSliceInternal'

/**
 * Строгий вариант `useSlice`: бросает, если слайса нет.
 *
 * @param key имя слайса.
 * @returns слайс.
 * @throws SettiError если слайса нет в реестре.
 */
export function useStrictSlice<S extends AbstractSlice<unknown>>(key: string): S {
    return useSliceInternal<S>(key, { observeState: true, strict: true })!
}
