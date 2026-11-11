import { Slice, TustenService } from '@tusten/core'
import type { FactoryImplementation } from '@tusten/core'

/** Пользователь. */
export interface User {
    id: number
    name: string
}

/** Состояние слайса. */
export interface UserListState {
    users: User[]
    total: number
    reload: () => void
}

/** Сервис для Users.List. */
export const usersService = new TustenService({ endpoint: 'Users', binding: { query: 'List' }, cache: 30000 })

/**
 * Enriched-слайс: `reload` создаётся заново на сервере и клиенте.
 */
export class UserListSlice extends Slice<UserListState> {
    /**
     * @param result результат `loadData` (`{ users }`).
     * @returns обогащённое состояние.
     */
    protected override _initState(result: unknown): UserListState {
        const { users } = result as { users: User[] }
        return {
            users,
            total: users.length,
            reload: () => {
                console.log('[UserList] reload (noop in example)')
            },
        }
    }
}

/**
 * Фабрика: `loadData` идёт в JSON-RPC `Users.List` через `Service`.
 */
export const UserListLoader: FactoryImplementation<UserListState> = {
    async loadData(args) {
        const limit = (args.limit as number | undefined) ?? 10
        const users = await usersService.query<{ limit: number }, User[]>({ limit })
        return { users }
    },
    slice: UserListSlice,
}
