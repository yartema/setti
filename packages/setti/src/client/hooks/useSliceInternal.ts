import { useCallback, useSyncExternalStore } from 'react'
import type { AbstractSlice } from '../slices/AbstractSlice'
import { useResourceContext } from '../context/SettiProvider'

/** Опции внутреннего хука. */
export interface UseSliceInternalOptions {
    /** Подписка на state (true) или только на присутствие слайса (false). */
    observeState?: boolean
    /** Кидать, если slice не найден. */
    strict?: boolean
}

/**
 * Внутренняя реализация `useSlice`.
 *
 * `S` — конкретный тип слайса; реестр хранит `AbstractSlice<unknown>`,
 * каст в точке возврата — ответственность вызывающего.
 *
 * @param key имя слайса.
 * @param options опции (observeState, strict).
 * @returns слайс или undefined (в strict-режиме — только слайс).
 */
export function useSliceInternal<S extends AbstractSlice<unknown>>(
    key: string,
    options: UseSliceInternalOptions = {},
): S | undefined {
    const { sliceRegistry } = useResourceContext()
    const { observeState = true, strict = false } = options

    // Подписка: следим и за изменениями state текущего инстанса, и за
    // сменой инстанса по ключу (setPage/setGlobal/dispose).
    const subscribe = useCallback(
        (listener: () => void) => {
            let current = sliceRegistry.get(key)
            let unsubSlice = current?.subscribe(listener)

            const unsubKey = sliceRegistry.subscribeKey(key, () => {
                const next = sliceRegistry.get(key)
                if (next !== current) {
                    unsubSlice?.()
                    current = next
                    unsubSlice = next?.subscribe(listener)
                }
                listener()
            })

            return () => {
                unsubKey()
                unsubSlice?.()
            }
        },
        [sliceRegistry, key],
    )

    const getSnapshot = useCallback(() => {
        const slice = sliceRegistry.get(key)
        if (!slice) return undefined
        return observeState ? slice.getState() : slice
    }, [sliceRegistry, key, observeState])

    useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return (strict ? sliceRegistry.require(key) : sliceRegistry.get(key)) as S | undefined
}
