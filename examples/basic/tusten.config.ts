import { defineConfig } from '@tusten/core'
import tailwindcss from '@tailwindcss/vite'

/**
 * Конфигурация примера.
 */
export default defineConfig({
    ssr: true,
    client: {
        layouts: {
            main: './layouts/Main.tsx',
            admin: './layouts/Admin.tsx',
        },
        css: ['styles/main.css'],
        components: {
            error: 'shared/ErrorBoundary:ErrorBoundary',
            loading: 'shared/Loading:Loading',
            notFound: 'shared/NotFound:NotFound',
        },
    },
    server: {
        routes: 'server/api/routes.ts',
    },
    i18n: {
        defaultLocale: 'ru',
        locales: ['en', 'ru'],
    },
    vite: {
        plugins: [tailwindcss()],
    },
    middleware: [{ id: 'logger', handler: 'client/shared/middleware/logger', side: 'both' }],
    fastify: {
        logger: false,
    },
})
