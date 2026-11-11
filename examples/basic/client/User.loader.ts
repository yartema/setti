import { defineGlobalLoader } from '@tusten/core'

/**
 * Глобальные loaders: `userInfo` доступен всем страницам.
 */
export default defineGlobalLoader({
    userInfo: {
        dataFactoryName: 'User/loaders/userInfo:UserInfoLoader',
        dependencies: [],
    },
})
