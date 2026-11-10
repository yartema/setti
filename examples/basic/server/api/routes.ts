import { defineServerRoutes } from 'nixo/server'

/**
 * API-роуты примера.
 */
export default defineServerRoutes([
    {
        method: 'GET',
        path: '/api/ping',
        handler: 'server/api/handlers/ping:ping',
    },
])
