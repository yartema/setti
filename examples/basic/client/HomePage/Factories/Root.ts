import type { FactoryMap, SettiRouter } from 'setti'

/**
 * `getConfig` для страницы HomePage.
 *
 * Возвращает карту фабрик; в Phase 1b её будет вызывать prefetch-пайплайн.
 *
 * @param _configParams статические аргументы из `router.ts`.
 * @param _router контекст маршрута.
 * @returns карта фабрик.
 */
export default function getConfig(_configParams: Record<string, unknown>, _router: SettiRouter): FactoryMap {
    return {
        UserList: {
            dataFactoryName: 'HomePage/Factories/usersList:UserListLoader',
            dataFactoryArguments: { limit: 10 },
            dependencies: [],
        },
    }
}
