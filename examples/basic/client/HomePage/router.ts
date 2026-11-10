import { defineRoute } from 'nixo'

/**
 * Маршрут главной страницы.
 * `index: true` — единственный глобально, id не попадает в URL.
 */
export default defineRoute([
    {
        id: 'home',
        index: true,
        title: 'Главная',
        description: 'Демо-страница nixo',
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
