import { defineRoute } from 'setti'

/**
 * Маршрут главной страницы.
 * `index: true` — единственный глобально, id не попадает в URL.
 */
export default defineRoute([
    {
        id: 'home',
        index: true,
        title: 'Главная',
        description: 'Демо-страница setti',
        type: 'main',
        middleware: [
            { id: 'auth', handler: 'client/middleware/auth' },
        ],
        contentConfig: {
            workspaceConfig: {
                template: 'HomePage/view:View',
            },
            prefetchConfig: {
                configLoader: 'HomePage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
