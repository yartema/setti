// server/blogs/Blogs.meta.ts
import { defineObject } from '@tusten/core/server'
import * as v from 'valibot'

export default defineObject({
    name: 'Blogs',
    description: 'Блог',
    methods: {
        ReadMetaInfo: {
            description: 'Возвращает meta для поста',
            params: v.string(),
            handler: async (url) => {
                const slug = new URL(url as string, 'https://x').pathname.split('/').pop() ?? 'unknown'
                return {
                    title: `Post ${slug} — Blog`,
                    meta: [
                        { name: 'description', content: `Post ${slug}` },
                        { name: 'og:title', content: `Post ${slug}`, attribute: 'property' as const },
                    ],
                    microdata: {
                        '@context': 'https://schema.org',
                        '@type': 'BlogPosting',
                        headline: `Post ${slug}`,
                    },
                }
            },
        },
    },
})
