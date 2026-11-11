import { Slice, SettiService } from 'setti'
import type { FactoryImplementation } from 'setti'

/** Данные пользователя. */
export interface UserInfo {
    id: number
    name: string
    /** Демонстрация Map (devalue). */
    permissions: Map<string, boolean>
    /** Демонстрация Date (devalue). */
    createdAt: Date
}

/** Сервис для Users.Read. */
const usersService = new SettiService({ endpoint: 'Users', cache: 30000 })

/** Слайс. */
export class UserInfoSlice extends Slice<UserInfo | null> {}

/**
 * Глобальный loader `userInfo`.
 *
 * Возвращает `Map` и `Date` — при SSR сериализуются `devalue`,
 * на клиенте восстанавливаются.
 */
export const UserInfoLoader: FactoryImplementation<UserInfo | null> = {
    async loadData() {
        try {
            const user = await usersService.call<{ id: number; name: string }>('Read', { id: 1 })
            return {
                id: user.id,
                name: user.name,
                permissions: new Map([
                    ['read', true],
                    ['write', false],
                ]),
                createdAt: new Date('2024-01-01T00:00:00Z'),
            }
        } catch {
            return null
        }
    },
    slice: UserInfoSlice,
}
