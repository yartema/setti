import { Slice } from 'nixo'
import type { FactoryImplementation, NixoRouter } from 'nixo'

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
        const router = ctx.router as NixoRouter
        const slug = router.params.slug ?? 'unknown'
        return {
            slug,
            title: `Post: ${slug}`,
            body: `Содержимое поста «${slug}».`,
        }
    },
    slice: PostSlice,
}
