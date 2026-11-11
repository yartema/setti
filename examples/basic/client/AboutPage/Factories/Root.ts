import type { FactoryMap } from '@tusten/core'

/**
 * `getConfig` для страницы About.
 *
 * @returns карта фабрик.
 */
export default function getConfig(): FactoryMap {
    return {
        AboutStats: {
            dataFactoryName: 'AboutPage/Factories/stats:StatsLoader',
            dataFactoryArguments: {},
            dependencies: [],
        },
    }
}
