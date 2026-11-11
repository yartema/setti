import type { FactoryMap } from 'setti'

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