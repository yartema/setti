# nixo — контекст для продолжения работы

> Скопируй содержимое в начало нового чата — и я продолжу с того же места.

---

## 🎯 Проект

**nixo** — fullstack-фреймворк на **React 19.x** + **Fastify 5** + **Vite 6/8** + **JSON-RPC 2.0**. Мета-фреймворк уровня Nuxt/Next: устанавливается как зависимость, сканирует `client/`, строит карту маршрутов, поднимает сервер с SSR/SPA + JSON-RPC.

**Репозиторий:** pnpm-монорепо.
- `packages/nixo` — фреймворк.
- `examples/basic` — демо (Tailwind v4, Home/About/Blog/Admin, `<Link>`, router API, API, middleware, JSON-RPC, вложенные layouts, error boundaries, devalue, cache).

**Стиль кода:** весь код с JSDoc. Framework `.tsx` — `createElement` (не JSX). User `.tsx` — обычный JSX.

---

## 📦 Три точки входа

| Импорт | Что внутри | Окружение |
|---|---|---|
| `nixo` | `defineNixoConfig`, `defineRoute`, `defineGlobalLoader`, `Slice`, `AbstractSlice`, `SliceRegistry`, `NixoService`, `Remote`, `Outlet`, `OutletProvider`, `renderLayoutChain`, `NixoErrorBoundary`, `NixoLoading`, `NixoNotFound`, `devalueParse`, `devalueStringify`, `runGlobalPrefetch`/`runPagePrefetch`, `NixoError`, `NixoRpcError`, `computePath`, `compileRoute`, `matchRoute`, типы | **client-safe**, pure TS |
| `nixo/server` | `loadConfig`, `scan`, `buildRouteTree`, `buildManifest`, `defineServerRoutes`, `defineServerPlugins`, `defineObject`, `scanRpcObjects`, `RpcRegistry` (+ `.describe()`), `createRpcHandler`, `createRpcExecutor`, `createNixoServer`, `createDevModuleLoader`, `createProdModuleLoader`, `nixoPlugin`, `buildProject`, `collectFactoryModules`, `runWithRpcContext`, `getRpcContext`, `parseCookieHeader`, `loadMiddleware`, `runServerMiddleware`, `loadServerRoutes`, `loadServerPlugins`, `registerServerRoutes`, `registerServerPlugins`, `serializeState`, `stringifyState` | Node-only |
| `nixo/client` | всё из `nixo` + `NixoProvider`, `useSlice`, `useStrictSlice`, `useSliceRef`, `useRouter`, `useParams`, `useQuery`, `usePathname`, `Link`, `Outlet`, `OutletProvider`, `renderLayoutChain`, `NixoErrorBoundary`, `NixoLoading`, `NixoNotFound`, `devalueParse`, `devalueStringify`, `useResourceContext` | браузер |

**Критично:** `nixo` не должен тянуть jiti/fastify/vite. Node-импорт в `./index.ts` или `./client/index.ts` → `Module "node:X" has been externalized`.

---

## ✅ Что готово

### Phase 1 — SSR + SPA + prod build + CSS
- Сканер `client/*/router.ts`, `client/**/*.loader.ts`.
- Дерево с валидацией (уникальность, циклы, один `index`, `type ∈ layouts`, A3).
- `renderToPipeableStream` + `Transform`.
- **Единый `NixoContext`**: `NixoProvider`/`SliceRegistry` через `vite.ssrLoadModule` (dev) / `dist/server/entry.js` (prod).
- `__NIXO_STATE_STR__` + `__NIXO_SSR__` + `__NIXO_MIDDLEWARE__`.
- `nixo build` / `nixo start`.
- CSS: `css.main` + per-component `import './x.css'` (dev — `<link>`, prod — из Vite manifest).
- SPA (`ssr: false`, `?noSSR=true`).
- Enriched `_initState` (`factoryLoaders` + `loadSliceClass`).

### Phase 2 — API, middleware, Router, JSON-RPC

#### API + plugins
- `defineServerRoutes` в `server.routes`.
- `defineServerPlugins({ order })` в `server/plugins/index.ts`.
- Порядок: `plugins → RPC /service → API → SSR`.
- JSON-404 для `Accept: application/json`.

#### Middleware (три реестра)
| Реестр | Путь | `ctx` | Возврат |
|---|---|---|---|
| Client page | `client/middleware/*.ts` | `{ to, from }` (`NavTarget = { path, pathname, params, query, route }`) | `void \| { redirect }` |
| Server page | `server/middleware/*.ts` | `{ router, route, globalSlices }` | `void \| { redirect }` |
| Server API | `server/api-middleware/*.ts` | `{ request, reply }` | `void \| FastifyReply` |

`MiddlewareDef = { id, handler, params?, side? }`. Side-фильтрация. Наследование по `parentId`. `middleware: []` — отключает.

#### Router API + Link
- `useRouter() → { push, replace, back, prefetch }`.
- `useParams`, `useQuery`, `usePathname`.
- `<Link href prefetch>` — **реальный** prefetch по hover (Phase 4.3).
- **`NixoProvider` — controlled** (`router` prop).
- `document.title` обновляется при `navigate`.

#### JSON-RPC 2.0 (`/service`)
- `config.rpc: { enabled, url, describe, extendContext }`.
- `defineObject(RpcObjectDefinition)` в `server/**/*.meta.ts` (рекурсивный скан).
- `RpcRegistry` с валидацией + `.describe()`.
- `POST /service` — одиночный + batch, `id` fallback 1..N.
- Валидация `params` (Standard Schema).
- `auth: true | { roles }` → `-32001`. `internal: true` → `-32601`.
- `requestId` (из `X-Request-Id` или UUID).
- **`NixoService`** — изоморфный клиент.
- **ALS executor**: на SSR `NixoService.call` → прямой вызов `RpcRegistry`.
- `NixoRpcError` с `code`/`detail`/`data`.
- **`System.Describe`** — встроенный метод.

#### Prefetch (изоморфный)
- `shared/prefetch.ts` — pure TS.
- `runGlobalPrefetch(ctx, {skipExisting?})`, `runPagePrefetch(ctx, globalStates)`.
- `PrefetchContext = { route, globalRegistry, loadModule, registry, router }`.
- **`/__nixo/prefetch` удалён.**

### Phase 3.1 — Динамические сегменты

`slug: string[]` — добавляется к цепочке `parentId → id`:

```ts
{ id: 'blog', slug: ['/regex:[a-z0-9-]+'] }         // /blog/<slug>, params.slug
{ id: 'user', slug: [':id'] }                       // /user/123, params.id
{ id: 'posts', slug: ['list'] }                     // /posts/list
{ id: 'catalog', slug: ['/regex:[0-9]+', ':sub'] }  // /catalog/42/foo
```

- `':param'` → `([^/]+)`.
- `'/regex:body'` → `(body)` — nixo **сам** оборачивает в `^...$`, имена `slug`, `slug1`, `slug2`.
- `'literal'` → экранированный.

`path: string` — абсолютный паттерн. **Взаимоисключающий с `slug`**.

`compileRoute`, `matchRoute(url, routeTree.compiled)`. Валидация: дубли URL, regex-коллизии → `NixoError`.

### Phase 3.2 — Вложенные layouts + `<Outlet/>`

Layout-цепочка по `parentId`:

```ts
{ id: 'home', index: true, type: 'main' }
{ id: 'admin', parentId: 'home', type: 'admin' }
```

→ URL `/admin`, цепочка `main → admin → template`.

`RouteTree.layoutChains: Map<string, string[]>`.
`renderLayoutChain(page, layouts)` из `nixo/client`. `<Outlet />` (Context) или `props.children`.

Файлы: `packages/nixo/src/client/layout.ts` — `Outlet`, `OutletProvider`, `renderLayoutChain`, `OutletContext`. Старый `Outlet.tsx` удалён.

### Phase 3.3 — Per-route `ssr: false`

```ts
{ id: 'admin', type: 'admin', ssr: false }
```

```ts
const globalSSR = config.ssr !== false
const routeSSR = globalSSR ? route.ssr !== false : false
const shouldSSR = routeSSR && query.noSSR !== 'true'
```

Правила:
- `config.ssr: false` — весь проект SPA (`route.ssr: true` игнорируется).
- `route.ssr: false` — только эта страница.
- `index: true + ssr: false` — `NixoError`.
- `?noSSR=true` — escape hatch.

При SPA: сервер отдаёт каркас, server middleware не вызывается, клиент — `clientPrefetch` + `createRoot`.

### Phase 3.4 — Error boundaries / Loading / Not Found

```ts
export default defineNixoConfig({
  components: {
    error: 'shared/ErrorBoundary:ErrorBoundary',
    loading: 'shared/Loading:Loading',
    notFound: 'shared/NotFound:NotFound',
  },
})
```

Пути от `clientDir`. Дефолты — `NixoErrorBoundary`, `NixoLoading`, `NixoNotFound`.

**`error`** — React Error Boundary (ловит `View()`, **не** `loadData`).
**`notFound`** — SSR `renderToString(<NixoProvider><NotFound/></NixoProvider>)` + клиент `hydrateRoot` (та же структура).
**`loading`** — во время SPA-prefetch.
**`components` в бандле:** добавлены в `specToPath` (client) + `allSsrSpecs` (SSR).

### Phase 4.1 — `System.Describe` + рекурсивный CSS-scan

**`System.Describe`** — встроенный JSON-RPC (обрабатывается в `processOne` до `registry.getMethod`). Возвращает `{ objects: [{ name, methods: [{ name, fullName, description, hasParams, auth, internal, meta }] }] }`.

**`collectDirectCssImports`** — рекурсивный обход графа `import` от `template`/`layout`, `visited` + `MAX_DEPTH = 30`. Решает FOUC для вложенных компонентов.

### Phase 4.2 — `devalue` для богатых типов

**`__NIXO_STATE__` → `__NIXO_STATE_STR__`** (JSON-строка от `devalue.stringify`).

**Поддержка:** `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, `Infinity`, `-0`, cyclic.

**Сервер** (`server/serialize.ts`): `devalueStringify(state).replace(/</g, '\\u003c')`.

**HTML:** `<script>window.__NIXO_STATE_STR__=${JSON.stringify(serializedStateJson || '')}</script>`.

**Клиент:** `devalueParse(window.__NIXO_STATE_STR__)`.

**Реэкспорт** в `packages/nixo/src/client/index.ts`:
```ts
export { parse as devalueParse, stringify as devalueStringify } from 'devalue'
```

**Правило:** `loadData` возвращает JSON-safe + богатые типы. Функции/computed — в `_initState`. Классы (не plain object) — ошибка.

### Phase 4.3 — Cross-page кэш в `NixoService`

**Кэш на уровне `NixoService`**, не `PrefetchResult`. Один вызов `service.query(...)` кэшируется для всех страниц.

```ts
const usersService = new NixoService({
  endpoint: 'Users',
  binding: { query: 'List' },
  cache: 30000,  // TTL 30 сек. Не задан / 0 — выключено.
})
```

**Per-call:** `service.call(method, params, { cache: 60000 | false })`.
**Инвалидация:** `service.invalidate()`, `service.invalidate('List')`, `service.invalidate('List', params)`, `NixoService.invalidateAll()` (static).
**Ключ:** `${endpoint}.${method}:${devalueStringify(params)}`.

**Изоморфность:**
- Клиент: модульный `Map` (кросс-страничный, кросс-инстансный).
- Сервер (SSR): per-request `Map` в ALS (`runWithRpcContext({ ..., cache: new Map() })`).

**`<Link prefetch>` — реальный:** при hover — `clientPrefetch` с `tempRegistry`, заполняет кэш `NixoService`. Клик → данные из кэша → мгновенно.

**Правила:**
- `cache` в конструкторе — все вызовы кэшируются.
- `cache: false` в `call` — без кэша.
- Кэш на сервере — **per-request** (ALS). Не шарится между пользователями.
- Auto-invalidate при мутациях — **не делаем**.

---

## 📂 Структура пакета

```
packages/nixo/src/
├── index.ts               # nixo (client-safe)
├── server.ts              # nixo/server
├── client/index.ts        # nixo/client + devalueParse/devalueStringify
├── cli.ts
├── define-config.ts
├── define-route.ts
├── define-global-loader.ts
├── define-server-routes.ts
├── define-server-plugins.ts
├── define-object.ts
├── config.ts
├── types.ts               # ServiceOptions, CallOptions, ServiceCacheEntry
├── errors.ts
├── scanner.ts
├── route-tree.ts          # layoutChains, compiled
├── url.ts                 # compileRoute / matchRoute
├── manifest.ts
├── resolver.ts
│
├── shared/prefetch.ts
│
├── client/
│   ├── slices/{AbstractSlice,Slice,SliceRegistry}.ts
│   ├── context/NixoProvider.tsx
│   ├── hooks/{useSlice,useStrictSlice,useSliceRef,useSliceInternal,useRouter,useParams,useQuery,usePathname}.ts
│   ├── rpc/{Remote,Service,server-bridge}.ts   # Service с кэшем; server-bridge: getServerCache
│   ├── layout.ts
│   ├── error-boundary.tsx
│   ├── loading.tsx
│   ├── not-found.tsx
│   └── Link.tsx
│
├── server/
│   ├── create-server.ts
│   ├── ssr-handler.ts                # renderToString, collectDirectCssImports (recursive), cache: new Map()
│   ├── prefetch.ts
│   ├── module-loader.ts
│   ├── serialize.ts                  # devalueStringify
│   ├── server-routes-loader.ts
│   ├── server-plugins-loader.ts
│   ├── api-register.ts
│   ├── middleware-loader.ts
│   ├── run-server-middleware.ts
│   ├── rpc-registry.ts               # + .describe()
│   ├── rpc-scanner.ts
│   ├── rpc-handler.ts
│   ├── rpc-executor.ts
│   └── rpc/{als,process}.ts          # als: cache; process: System.Describe
│
├── vite/plugin.ts           # virtual:nixo/{routes,client-entry,ssr-entry}
│
├── build/{build,build-client,build-server,collect-factories}.ts
│
└── utils/{fs,css,interpolate}.ts
```

---

## 🔑 Ключевые архитектурные решения

| Область | Выбор |
|---|---|
| SSR-движок | `renderToPipeableStream` + `hydrateRoot` |
| SPA | `createRoot` + клиентский prefetch через `NixoService` |
| Режим | `config.ssr !== false && route.ssr !== false && query.noSSR !== 'true'` → SSR |
| URL | `parentId → id` + `slug[]` (или `path`) |
| Layouts | вложенные по `parentId` |
| `<Outlet/>` | `OutletContext` + `props.children` |
| Error boundary | `NixoErrorBoundary` |
| Loading / NotFound | `config.components` |
| Слайсы | `AbstractSlice` → `Slice`; `page` + `global` |
| Middleware | Три реестра |
| Данные | `getConfig` → топосорт → `loadData` |
| Prefetch | Изоморфный, `/__nixo/prefetch` удалён |
| JSON-RPC | `defineObject` + `RpcRegistry` + `/service` + `System.Describe` |
| `NixoService` | Изоморфный + **кэш** (TTL, invalidate) |
| Кэш | Per-instance (клиент), per-request (SSR через ALS) |
| Сериализация | `devalue` → `__NIXO_STATE_STR__` |
| CSS dev | Рекурсивный `collectDirectCssImports` |
| `config.fastify` | `FastifyServerOptions<RawServerDefault>` |
| `NixoProvider` | controlled (`router` prop) |
| React | `^19.0.0` |

---

## 📐 Схемы

### `NixoRoute`

```ts
{
  id, parentId?, title, description?,
  type,                          // ключ из config.layouts
  index?, ssr?,                  // ssr: false → SPA
  path?, slug?,                  // взаимоисключающие
  middleware?,
  contentConfig: {
    workspaceConfig: { template, templateProps? },
    prefetchConfig: { configLoader, configParams?, dependencies? },
  },
  meta?,
}
```

### `ServiceOptions`

```ts
{
  url?, endpoint?, method?, binding?, timeout?,
  cache?: number,                // TTL, ms. Не задан / 0 — без кэша.
}
```

### `NixoConfig`

```ts
{
  ssr, clientDir, serverDir,
  layouts, components,
  server: { port, host, routes?, plugins? },
  fastify, rpc: false | {...},
  middleware, css: { main }, vite, build,
}
```

---

## ⚠️ Подводные камни

1. **`NixoProvider`/`SliceRegistry`/`renderLayoutChain`/`NixoErrorBoundary`/`NixoLoading`/`NixoNotFound`/`devalueParse`** — через `vite.ssrLoadModule` (dev) / `dist/server/entry.js` (prod).
2. **Framework `.tsx` — `createElement`, не JSX.**
3. **`appType: 'custom'` + `@vitejs/plugin-react`** → preamble.
4. **`import.meta.glob` не работает** в virtual modules.
5. **`Transform` для суффикса**, не `write()` после `pipe`.
6. **`resolveSpec` принимает только СПЕКИ**.
7. **`modules` в SSR-бандле** ключуется без `:export`.
8. **`nixo/client` не externalize** в SSR build.
9. **`nixo` не тянет Node.**
10. **Backticks нельзя в JSDoc внутри template literals.**
11. **`loadData` → JSON-safe + богатые типы**, функции — в `_initState`.
12. **`FastifyServerOptions<RawServerDefault>`.**
13. **Middleware side-фильтрация.**
14. **`Required<ResolvedNixoConfig>`** — нет.
15. **`NixoProvider` — controlled.**
16. **`buildNavTarget` через `URL.pathname`.**
17. **`ctx` в `processOne` — `{} as RpcContext`.**
18. **`/__nixo/prefetch` удалён.**
19. **`path` и `slug` взаимоисключающие.**
20. **Regex-коллизии** — `NixoError`.
21. **`/regex:body`** — обёртка `^...$` автоматическая.
22. **`document.title` в `navigate`.**
23. **`Layout` — `children` и `<Outlet/>`, не оба.**
24. **`OutletProvider.children?: ReactNode`.**
25. **`components` в `specToPath` И `allSsrSpecs`.**
26. **`index: true + ssr: false`** — `NixoError`.
27. **404 — `renderToString` + `hydrateRoot`.**
28. **ErrorBoundary не ловит `loadData`.**
29. **`__NIXO_STATE_STR__` — строка, не объект.** Парсинг — `devalueParse` из `nixo/client`.
30. **`devalueParse`/`devalueStringify` — только из `nixo/client`.**
31. **`devalue` — одна версия** (`pnpm ls -r devalue`).
32. **`devalue.stringify` не сериализует функции/классы.**
33. **`System.Describe` до `registry.getMethod`.**
34. **`collectDirectCssImports` рекурсивный.**
35. **Кэш `NixoService`:** клиент — модульный `Map`, сервер — per-request ALS. **Не шарить между пользователями.**
36. **`cache: 0` / не задан** — кэш выключен (явное включение, не дефолт).
37. **`invalidate()`** — для endpoint, `invalidate(method)` — метод, `invalidate(method, params)` — точечно.
38. **`<Link prefetch>`** использует `tempRegistry` + кэш `NixoService`.
39. **`.vite` кэш** — после правок `plugin.ts`/`serialize.ts` **всегда** `rm -rf examples/basic/node_modules/.vite`.
40. **Windows:** `localhost` → `::1`. `127.0.0.1` или `host: '::'`.
41. **Windows + pnpm:** Ctrl+C не убивает дочерние процессы.

---

## 🧪 Команды

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm dev:basic                                   # → http://localhost:3000
NIXO_DEBUG=1 pnpm dev:basic
pnpm --filter examples-basic exec nixo build
pnpm --filter examples-basic exec nixo start
pnpm inspect:basic
pnpm ls -r devalue
```

**Проверки:**
| URL | Ожидаемо |
|---|---|
| `/` | SSR, `Users: 10 · reload: function`, `userInfo: demo` + `Map ✓`, `Date ✓` |
| `/?noSSR=true` | SPA |
| `/about` | SSR, SPA-переходы |
| `/blog/hello` | SSR, `slug: hello` |
| `/admin` | SPA (`ssr: false`): `Loading` → admin, layouts `main → admin` |
| `/nonexistent` | кастомная 404 |
| `POST /service` → `System.Describe` | `{ objects: [...] }` |
| `window.__NIXO_STATE_STR__` | строка |
| `slice.getState().permissions instanceof Map` | `true` |
| **Кэш:** `/` → `/about` → `/` | **0 запросов** `POST /service` (TTL 30 сек) |
| **Кэш:** hover `<Link prefetch>` | `POST /service` **до** клика |

**Console:** чисто.

---

## 🗺 Что дальше — Phase 5

### Server Actions (без RSC)

`'use server'` — маркер файла. При сборке nixo:
1. **Не** включает в клиентский бандл.
2. Генерирует **RPC-ссылку** (id функции).
3. Клиент вызывает `POST /__nixo/action` с `{ actionId, args }`.
4. Сервер находит функцию по id, вызывает, возвращает результат.

**API:**
- `'use server'` в начале файла.
- `revalidate(path)` — инвалидирует кэш маршрута (интеграция с `NixoService.invalidate()`).

**Пример:**
```tsx
// server/actions/saveUser.ts
'use server'
export async function saveUser(formData: FormData) {
  const name = formData.get('name')
  await db.users.create({ name })
  revalidate('/users')
}
```

```tsx
// client/UserForm.tsx
import { saveUser } from '../../server/actions/saveUser'

<form action={saveUser}>
  <input name="name" />
  <button>Save</button>
</form>
```

**Почему не RSC:**
- RSC требует Flight-протокол (месяцы разработки), разделение server/client bundl'ов.
- Server Actions — 80% пользы за 1–2 итерации, совместимы с текущей архитектурой (`Slice` + `/service` для чтения, Actions для мутаций).

### Потом (опционально) — RSC
Только если проект вырастет и упрётся в bundle size. Отдельный большой этап.

---

## 🧭 С чего продолжить

Скажи: **«Продолжаем nixo, Phase 5 — Server Actions»**. Я перечитаю контекст, выдам код.

---

## 📋 Ключевые файлы

- `packages/nixo/src/types.ts` — `NixoConfig`, `NixoRoute`, `ServiceOptions` (+ `cache`), `CallOptions`, `ServiceCacheEntry`
- `packages/nixo/src/client/rpc/Service.ts` — кэш + invalidate
- `packages/nixo/src/client/rpc/server-bridge.ts` — `getServerCache()`
- `packages/nixo/src/server/rpc/als.ts` — `cache: Map` в контексте
- `packages/nixo/src/server/ssr-handler.ts` — `runWithRpcContext({ ..., cache: new Map() })`
- `packages/nixo/src/vite/plugin.ts` — `<Link prefetch>` → реальный prefetch
- `packages/nixo/src/client/index.ts` — реэкспорт `devalueParse`/`devalueStringify`
- `packages/nixo/src/server/serialize.ts` — `devalue.stringify`
- `packages/nixo/src/server/rpc-registry.ts` — `.describe()`
- `packages/nixo/src/server/rpc/process.ts` — `System.Describe`

---

## 📄 Полная документация

`packages/nixo/README.md`.
