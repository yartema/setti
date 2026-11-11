import { useEffect } from 'react'
import type { MetaTag } from '../../types'

/** Опции хука. */
export interface UsePageMetaOptions {
    title?: string
    meta?: MetaTag[]
    microdata?: Record<string, unknown>
}

/**
 * Динамическая meta для текущего компонента. Client-only (SSR — no-op).
 *
 * Мерж:
 *   - `title` — override текущего `document.title`;
 *   - `meta[]` — по `name`: совпал — перезапись `content`, иначе — добавление;
 *   - `microdata` — **override** (старый JSON-LD удаляется).
 *
 * @param opts опции.
 */
export function usePageMeta(opts: UsePageMetaOptions): void {
    const { title, meta, microdata } = opts

    useEffect(() => {
        if (typeof document === 'undefined') return
        if (title) document.title = title

        for (const tag of meta ?? []) {
            const attr = tag.attribute ?? 'name'
            const selector = `meta[${attr}="${CSS.escape(tag.name)}"]`
            let el = document.head.querySelector<HTMLMetaElement>(selector)
            if (!el) {
                el = document.createElement('meta')
                el.setAttribute(attr, tag.name)
                document.head.appendChild(el)
            }
            el.setAttribute('content', tag.content)
        }

        if (microdata && Object.keys(microdata).length > 0) {
            for (const old of document.head.querySelectorAll('script[type="application/ld+json"]')) {
                old.remove()
            }
            const script = document.createElement('script')
            script.type = 'application/ld+json'
            script.textContent = JSON.stringify(microdata)
            document.head.appendChild(script)
        }
    }, [title, meta, microdata])
}
