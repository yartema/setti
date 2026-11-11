import { defineRoute } from '@tusten/core'

/**
 * Маршрут страницы About.
 */
export default defineRoute([
    {
        id: 'about',
        title: 'About',
        description: 'О фреймворке tusten',
        type: 'main',
        middleware: [],
        contentConfig: {
            workspaceConfig: {
                template: 'AboutPage/view:View',
            },
            prefetchConfig: {
                configLoader: 'AboutPage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
