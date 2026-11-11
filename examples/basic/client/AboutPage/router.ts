import { defineRoute } from 'setti'

/**
 * Маршрут страницы About.
 */
export default defineRoute([
    {
        id: 'about',
        title: 'About',
        description: 'О фреймворке setti',
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
