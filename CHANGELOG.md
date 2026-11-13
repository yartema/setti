# Changelog

Все заметные изменения проекта **tusten**.
Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
Breaking changes помечены **BREAKING**.

## [Unreleased]

## [0.2.0-beta.5] — 2026-11-14

### Breaking

- **Формат `tusten.config.ts`** приведён к структуре `ResolvedTustenConfig`:
    ```ts
    export default defineConfig({
        ssr: true,
        client: {
            clientDir: 'client',
            layouts: { main: './layouts/Main.tsx' },
            css: ['styles/main.css'],
            components: { error, loading, notFound },
        },
        server: { serverDir: 'server', port, host, routes, plugins, rpc },
        middleware,
        vite,
        build,
        runtimeConfig,
        fastify,
    })
    ```
    - `clientDir`, `layouts`, `css`, `components` переехали в `client`;
    - `serverDir` и `rpc` переехали в `server`;
    - `css` теперь **массив** путей (было `{ main: string }`) — в dev каждый файл даёт свой `<link>`.
- **`Slice.dispose()` → `Slice.destroy()`**. `dispose()` оставлен как `@deprecated`-алиас, но теперь тоже очищает state. Уничтоженный слайс: `setState` — no-op (+ `console.warn` вне production), `subscribe` — пустая отписка.
- **`SerializedState.slices[*].config`** — новый элемент `__ROOT_STATE_STR__` (в типе `optional` для чтения старых снимков).

### Added

- `AbstractSlice.destroy()` / `isDestroyed()`; уничтожение освобождает подписчиков и state.
- `_initState(result, config)` / `hydrate(result, config)`: вторым аргументом приходит `dataFactoryArguments` фабрики. Config сериализуется в `__ROOT_STATE_STR__`, поэтому SSR-гидратация на клиенте получает те же значения, что и сервер.
- `SliceRegistry.adoptPage(source)` — атомарная подмена page-слайсов при SPA-навигации; `setPage` / `setGlobal` уничтожают заменяемый инстанс.
- `setState` для plain-объектов делает **поверхностный мерж** (было — полная замена): `setState({ total: 0 })` сохраняет остальные ключи. Для массивов, `Map`/`Date` и экземпляров классов — замена. Новый публичный тип `SlicePatch<TState>`.
- SSR: заголовки `Cache-Control: no-store` и `Vary: Accept` (404), кэш `loadModule` в prod, статические фрагменты документа вынесены из per-request пути.
- `utils/fs`: `resolveRealPath()` и `toVitePath()` — канонический регистр путей для Vite/HMR.
- `getRouter()` — навигатор без React-контекста для обработчиков, сервисов и таймеров. Тот же API, что у `useRouter()`.
- **i18n клиентских модулей.** Импорт `import rk from 'i18n!<Module>'` (единственный синтаксис). Словари — `client/<Module>/lang/<locale>/<locale>.json`; конфиг — `defineConfig({ i18n: { defaultLocale, locales } })`.
    - `rk(key, ctx?)` — ключ = текст на исходном языке, поиск `ctx@@key` → `key`; нет перевода → ключ, без ошибок. Битый JSON и нестроковые значения — ошибка сборки.
    - `template(str, params, locale?)` — `{name}` и `{n, plural, one {…} few {…} many {…} other {…}}` (подмножество ICU, `other` обязателен).
    - Locale: cookie `tusten_locale` → `Accept-Language` (с `q`) → `defaultLocale`. SSR-рендер и словари встраиваются в HTML; гидрация без mismatch. Параллельные запросы изолированы через `AsyncLocalStorage`.
    - `setLocale(l)` (`@tusten/core/client`) — cookie и перезагрузка страницы. Реактивного переключения нет.
    - Типы: `declare module 'i18n!*'` подключается через `@tusten/core/client`.
    - Тесты: `i18nTestPlugin()` из `@tusten/core/server` — в Vitest `i18n!X` превращается в заглушку, `rk(key)` возвращает `key`.
    - `tusten inspect` печатает i18n-модули: число ключей по locale, отсутствующие словари, ошибки JSON.

### Fixed

- **HMR на Windows/macOS**: правка компонента не подхватывалась без перезапуска dev, если регистр в спеке не совпадал с файлом (`'HomePage/view'` ↔ `View.tsx`). Причина — Vite регистрировал модуль под `view.tsx`, а watcher присылал `View.tsx`. Пути канонизируются через `realpathSync.native` в `module-loader`, `vite/plugin` и `serialize`.
- `serialize`: `modulePath` ломался, когда `projectDir` был коротким путём (`C:\Users\AV-BAR~1\...`), а `realpath` — длинным (`../../../../../...`).
- SSR: исключение после `reply.hijack()` (парсинг URL, 404-рендер, middleware) оставляло запрос висеть до таймаута — добавлен внешний `try/catch` и guard на повторный `end()`. В production клиенту больше не уходит текст внутренней ошибки.
- `queryToObject` падал с `URIError` на битом percent-encoding (`?a=%`) — заменён на `URLSearchParams`.
- SPA-переход: при ошибке `loadData` новая страница больше не оставляет пользователя с уже уничтоженными слайсами — prefetch идёт в отдельный реестр, подмена только после успеха.
- независимые фабрики грузятся параллельно, и для `runPagePrefetch`, и для `runGlobalPrefetch`. Каждая ждёт только свои зависимости. Порядок записи в `slices` и `registry` остался прежним (топологический)
- чанки шаблона и `layout`, `Error` и классы слайсов грузятся параллельно. `Loading` в `SSR` больше не качается. Добавил защиту от устаревшей навигации, `onRecoverableError` для `hydration` `mismatch` и прогрев чанка шаблона при prefetch. resolveMeta больше не блокирует `SPA-переход`, и `document.title` перестал затираться (раньше `route.title` перетирал заголовок из `meta`).
- `CSS` берётся по всей цепочке `layout` и из imports. В `<head>` добавлен `modulepreload` для `client.js`, чанков маршрута и слайсов. Слои и шаблон грузятся параллельно, `ErrorComponent` стартует до `prefetch`.

### Changed

- `examples/basic` переведён на новую структуру конфига; `UserListState.limit` демонстрирует второй аргумент `_initState`.
- Документация: `packages/tusten/README.md` — генерируемая копия корневого (`prepack`), правило зафиксировано в `AGENTS.md`; файл добавлен в `.gitignore`.
- `useRouter()` — тонкая обёртка над `getRouter()`. Вызов вне `<RootProvider>` больше не бросает `TustenError`.

## [0.2.0-beta.4] — 2026-11-12

### Added

- `resolveMeta`: динамический `<title>` из `readMethod` / `getMetaCallback` (`MetaResult.title`); приоритет — метод > `metaConfig.title` > `'Страница'`.
- `Service`: LRU-кэш (`cacheMaxEntries`, по умолчанию 500) и `cacheSize()` для тестов.

### Changed

- `Service` и `RpcError` экспортируются как есть, без префикса `Tusten`.

### Published

- `@tusten/core@0.2.0-beta.4` в npm (`beta` / `latest`).

## [0.2.0-beta.1] — 2026-11-11

### Added

- Публикация под именем **`@tusten/core`** (ранее пакет назывался `setti`).
- Три entry points: `@tusten/core` (client-safe), `@tusten/core/server` (Node), `@tusten/core/client` (React).
- SSR / SPA / prod build: `renderToPipeableStream` + `hydrateRoot`, per-route `ssr: false`, `?noSSR=true`, стриминг, CSS (Tailwind и per-component).
- Файловый роутинг `defineRoute`: `index`, `parentId`, `path` / `slug` (динамические сегменты), вложенные layouts, error boundary / loading / notFound.
- JSON-RPC 2.0: `defineObject`, `/service`, batch, Standard Schema (valibot / zod / arktype), `auth`, `ctx.call`, `System.Describe`, ALS executor для SSR.
- `defineServerRoutes` / `defineServerPlugins`, три реестра middleware.
- Слайсы: `AbstractSlice` / `Slice` / `SliceRegistry` (page + global), `useSlice` / `useStrictSlice` / `useSliceRef`, изоморфный `loadData`.
- SEO / meta: `metaConfig`, `readMethod`, `getMetaCallback`, `usePageMeta`, `microdata` (JSON-LD).
- `devalue` в `__ROOT_STATE_STR__` (`Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, циклы).
- Cross-page кэш `Service`: TTL, `invalidate()`, `<Link prefetch>`.
- Unit-тесты (Vitest), CI GitHub Actions (`format:check`, `lint`, `typecheck`, `test`), Prettier + ESLint.

### Added

- Первый коммит: структура монорепо (`packages/` + `examples/basic`), скаффолд клиента и сервера, базовая документация.

[Unreleased]: https://github.com/yartema/tusten-framework/compare/v0.2.0-beta.5...HEAD
[0.2.0-beta.5]: https://github.com/yartema/tusten-framework/compare/v0.2.0-beta.4...v0.2.0-beta.5
[0.2.0-beta.4]: https://github.com/yartema/tusten-framework/compare/v0.2.0-beta.1...v0.2.0-beta.4
[0.2.0-beta.1]: https://github.com/yartema/tusten-framework/compare/v0.2.0-alpha.3...v0.2.0-beta.1
[0.2.0-alpha.3]: https://github.com/yartema/tusten-framework/compare/b07c3ae...v0.2.0-alpha.3
[0.1.0]: https://github.com/yartema/tusten-framework/commit/b07c3ae
