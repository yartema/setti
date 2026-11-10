import { Slice, NixoService } from 'nixo'
import type { FactoryImplementation } from 'nixo'

/** Данные для About. */
export interface AboutStatsState {
    routes: number
    slices: number
    frameworks: string[]
}

/** Сервис для System.Ping. */
const systemService = new NixoService({ endpoint: 'System' })

/** Слайс. */
export class StatsSlice extends Slice<AboutStatsState> {}

/**
 * Фабрика: `loadData` идёт в `System.Ping` (демонстрация).
 */
export const StatsLoader: FactoryImplementation<AboutStatsState> = {
    async loadData() {
        await systemService.call('Ping')
        return {
            routes: 2,
            slices: 3,
            frameworks: ['React 19', 'Fastify', 'Vite'],
        }
    },
    slice: StatsSlice,
}