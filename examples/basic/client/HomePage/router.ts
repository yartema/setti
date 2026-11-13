import { defineRoute } from '@tusten/core'

/**
 * Маршрут главной страницы.
 * `index: true` — единственный глобально, id не попадает в URL.
 */
export default defineRoute([
    {
        id: 'home',
        index: true,
        metaConfig: {
            title: 'Главная',
        },
        type: 'main',
        middleware: [{ id: 'auth', handler: 'client/middleware/auth' }],
        contentConfig: {
            workspaceConfig: {
                template: 'HomePage/View:View',
            },
            prefetchConfig: {
                configLoader: 'HomePage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
