import { defineRoute } from 'nixo'

/**
 * Маршрут блога: `/blog/:slug`.
 *
 * `path` — абсолютный паттерн с динамическим сегментом `:slug`.
 * `id` — стабильный ключ (`blog-post`), не зависит от slug.
 */
export default defineRoute([
    {
        id: 'blog',
        slug: [':id'],
        title: 'Blog Post',
        description: 'Пост блога',
        type: 'main',
        contentConfig: {
            workspaceConfig: {
                template: 'BlogPage/view:View',
            },
            prefetchConfig: {
                configLoader: 'BlogPage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
