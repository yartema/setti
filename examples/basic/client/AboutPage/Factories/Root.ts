import type { FactoryMap } from 'nixo'

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