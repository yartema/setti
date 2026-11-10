import { AbstractSlice } from './AbstractSlice'

/**
 * Конкретная реализация `AbstractSlice`.
 *
 * Отличается только `_initState` — identity (result как есть). Прикладной
 * слайс наследуется от `Slice<TState>` и переопределяет `_initState`, если
 * нужно обогатить state.
 *
 * @example
 * ```ts
 * class UserListSlice extends Slice<UserPublic[]> {
 *   setUsers(users: UserPublic[]) {
 *     this.setState(users)
 *   }
 * }
 * ```
 */
export class Slice<TState = unknown> extends AbstractSlice<TState> {
    /**
     * Identity: state = result как есть.
     *
     * @param result результат `loadData`.
     * @returns тот же результат.
     */
    protected override _initState(result: unknown): TState {
        return result as TState
    }
}