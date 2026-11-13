import type { Plugin } from 'vite'
import { I18N_USER_PREFIX } from './i18n'

/**
 * Внутренний префикс виртуальных заглушек. `\0` — соглашение Vite для модулей без файла.
 */
const STUB_PREFIX = '\0tusten-i18n-stub:'

/**
 * Vite-плагин для тестов (Vitest): `i18n!<Module>` резолвится в заглушку,
 * у которой `rk(key)` возвращает `key`.
 *
 * Зачем: тесты компонентов, которые импортируют i18n-модули, падают на резолве, потому что
 * словарей и `tustenPlugin` в тестовом конфиге нет. Заглушка делает результат детерминированным:
 * в тестах видны исходные ключи. Словари и локаль тестами не проверяются — для этого
 * используйте `tustenPlugin` с реальным конфигом.
 *
 * Использование в `vitest.config.ts`:
 * ```ts
 * import { i18nTestPlugin } from '@tusten/core/server'
 * export default defineConfig({ plugins: [i18nTestPlugin()] })
 * ```
 *
 * @returns Vite-плагин; подключать только в конфиге тестов.
 */
export function i18nTestPlugin(): Plugin {
    return {
        name: 'tusten:i18n-test-stub',
        enforce: 'pre',
        resolveId(id) {
            if (id.startsWith(I18N_USER_PREFIX)) return STUB_PREFIX + id
            return null
        },
        load(id) {
            if (!id.startsWith(STUB_PREFIX)) return null
            // Сигнатура совпадает с публичным `rk(key, ctx?)`: ctx не нужен, т.к. перевода нет.
            return 'export default function rk(key) { return key }\n'
        },
    }
}
