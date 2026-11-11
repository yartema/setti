import { defineSettiConfig } from 'setti'
import tailwindcss from '@tailwindcss/vite'

/**
 * Конфигурация примера.
 */
export default defineSettiConfig({
    ssr: true,
    layouts: {
        main: './layouts/Main.tsx',
        admin: './layouts/Admin.tsx',
    },
    css: {
        main: 'styles/main.css',
    },
    vite: {
        plugins: [tailwindcss()],
    },
    server: {
        routes: 'server/api/routes.ts',
    },
    middleware: [
        { id: 'logger', handler: 'client/shared/middleware/logger', side: 'both' },
    ],
    fastify: {
        logger: false,
    },
    components: {
        error: 'shared/ErrorBoundary:ErrorBoundary',
        loading: 'shared/Loading:Loading',
        notFound: 'shared/NotFound:NotFound',
    },
})
