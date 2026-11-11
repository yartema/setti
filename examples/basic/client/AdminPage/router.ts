import { defineRoute } from '@tusten/core'

/**
 * Маршрут админки. `parentId: 'home'` → URL `/admin`
 * (home — index, его id не добавляется). Layout-цепочка:
 * `main (home.type) → admin (this.type)`.
 */
export default defineRoute([
    {
        id: 'admin',
        parentId: 'home',
        metaConfig: {
            title: 'Admin Page',
        },
        type: 'admin',
        ssr: false,
        contentConfig: {
            workspaceConfig: {
                template: 'AdminPage/view:View',
            },
            prefetchConfig: {
                configLoader: 'AdminPage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
