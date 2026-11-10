import type { FactoryMap } from 'nixo'

/**
 * `getConfig` для страницы Blog.
 *
 * @returns карта фабрик.
 */
export default function getConfig(): FactoryMap {
    return {
        BlogPost: {
            dataFactoryName: 'BlogPage/Factories/blogPost:BlogPostLoader',
            dependencies: [],
        },
    }
}
