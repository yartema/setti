import { defineGlobalLoader } from 'nixo'

/**
 * Глобальные loaders: `userInfo` доступен всем страницам.
 */
export default defineGlobalLoader({
    userInfo: {
        dataFactoryName: 'User/loaders/userInfo:UserInfoLoader',
        dependencies: [],
    },
})
