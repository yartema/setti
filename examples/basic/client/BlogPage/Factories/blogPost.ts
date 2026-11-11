import { Slice } from '@tusten/core'
import type { FactoryImplementation, TustenRouter } from '@tusten/core'

/** Пост. */
export interface Post {
    slug: string
    title: string
    body: string
}

/** Слайс поста. */
export class PostSlice extends Slice<Post> {}

/**
 * Загрузчик поста: использует `ctx.router.params.slug`.
 */
export const BlogPostLoader: FactoryImplementation<Post> = {
    async loadData(_args, _deps, ctx) {
        const router = ctx.router as TustenRouter
        const slug = router.params.id ?? 'unknown'
        return {
            slug,
            title: `Post: ${slug}`,
            body: `Содержимое поста «${slug}».`,
        }
    },
    slice: PostSlice,
}
