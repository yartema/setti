import { defineRoute } from '@tusten/core'

/**
 * Маршрут страницы About.
 */
export default defineRoute([
    {
        id: 'about',
        metaConfig: {
            title: 'About Page',
        },
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
