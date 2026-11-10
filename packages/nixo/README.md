# nixo

Fullstack-фреймворк на **React 19**, **Fastify** и **Vite**.
Устанавливается как зависимость, предоставляет SSR и SPA «из коробки».

- **Реактивность** — собственный store слайсов (`Slice` / `SliceRegistry`).
- **Роутинг** — конфигурируемый (`router.ts` → `defineRoute([...])`).
- **Данные** — двухуровневый prefetch: глобальные loaders + page-scoped фабрики.
- **SSR** — стриминг через `renderToPipeableStream` + `hydrateRoot`.
- **HMR** — Fast Refresh из `@vitejs/plugin-react`.

---

## 📦 Установка

```bash
pnpm add nixo
```

`react` и `react-dom` — peer-зависимости:

```bash
pnpm add react react-dom
```

---

## 🚀 Быстрый старт

### 1. `nixo.config.ts` в корне проекта

```ts
import { defineNixoConfig } from 'nixo'

export default defineNixoConfig({
  ssr: true,
  layouts: {
    main: './layouts/Main.tsx',
  },
  css: {
    main: 'styles/main.css',
  },
  server: { port: 3000, host: '0.0.0.0' },
})
```

### 2. Клиентский каталог `client/`

```
client/
├── HomePage/
│   ├── router.ts                # defineRoute([...])
│   ├── view.tsx                 # компонент страницы
│   └── Factories/
│       ├── Root.ts              # getConfig(configParams, router) → FactoryMap
│       └── usersList.ts         # UserListLoader + UserListSlice
├── User.loader.ts               # defineGlobalLoader({...})
├── layouts/
│   └── Main.tsx
└── styles/
    └── main.css
```

### 3. Маршрут (`client/HomePage/router.ts`)

```ts
import { defineRoute } from 'nixo'

export default defineRoute([
  {
    id: 'home',
    index: true,
    title: 'Главная',
    type: 'main',
    contentConfig: {
      workspaceConfig: { template: 'HomePage/view:View' },
      prefetchConfig: {
        configLoader: 'HomePage/Factories/Root',
        configParams: {},
        dependencies: ['userInfo'],
      },
    },
  },
])
```

### 4. Prefetch (`client/HomePage/Factories/Root.ts`)

```ts
import type { FactoryMap, NixoRouter } from 'nixo'

export default function getConfig(
  configParams: Record<string, unknown>,
  _router: NixoRouter,
): FactoryMap {
  return {
    UserList: {
      dataFactoryName: 'HomePage/Factories/usersList:UserListLoader',
      dataFactoryArguments: { limit: 10 },
      dependencies: [],
    },
  }
}
```

### 5. Фабрика (`client/HomePage/Factories/usersList.ts`)

```ts
import { Slice, type FactoryImplementation } from 'nixo'

interface User { id: number }

export class UserListSlice extends Slice<User[]> {
  setUsers(users: User[]): void {
    this.setState(users)
  }
}

export const UserListLoader: FactoryImplementation<User[]> = {
  async loadData(args) {
    const limit = (args.limit as number) ?? 10
    return Array.from({ length: limit }, (_, i) => ({ id: i + 1 }))
  },
  slice: UserListSlice,
}
```

### 6. Компонент (`client/HomePage/view.tsx`)

```tsx
import { useSlice } from 'nixo/client'
import type { UserListSlice } from './Factories/usersList'

export function View() {
  const slice = useSlice<UserListSlice>('UserList')
  const users = slice?.getState() ?? []
  return <h1>Users: {users.length}</h1>
}
```

### 7. Глобальный загрузчик (`client/User.loader.ts`)

```ts
import { defineGlobalLoader } from 'nixo'

export default defineGlobalLoader({
  userInfo: {
    dataFactoryName: 'User/loaders/userInfo:UserInfoLoader',
    dependencies: [],
  },
})
```

### 8. Запуск

## 🧪 Команды

```bash
# Из корня
pnpm install
pnpm lint          # 0 errors, 0 warnings
pnpm typecheck     # 0 errors

# Dev
pnpm dev:basic                                   # → http://localhost:3000
NIXO_DEBUG=1 pnpm dev:basic                      # + логи __NIXO_STATE__

# Prod
pnpm --filter examples-basic exec nixo build     # → examples/basic/dist/
pnpm --filter examples-basic exec nixo start     # → http://localhost:3000

# Инспекция
pnpm inspect:basic
```

---

## 🏗 Архитектура

### Точки входа

| Импорт | Что внутри | Когда использовать |
|---|---|---|
| `nixo` | `defineNixoConfig`, `defineRoute`, `defineGlobalLoader`, `Slice`, `AbstractSlice`, `SliceRegistry`, `NixoError`, `computePath`, типы | **client-safe**: `nixo.config.ts`, `router.ts`, `*.loader.ts`, фабрики, компоненты |
| `nixo/server` | `loadConfig`, `scan`, `buildRouteTree`, `buildManifest`, `createNixoServer`, `createDevModuleLoader`, `createProdModuleLoader`, `runPrefetch`, `serializeState`, `nixoPlugin`, `buildProject`, `collectFactoryModules` | только серверный код (кастомный `server/`, CLI) |
| `nixo/client` | всё из `nixo` + `NixoProvider`, `useSlice`, `useStrictSlice`, `useSliceRef`, `useResourceContext` | React-компоненты, хуки |

**Критично:** `nixo` **не тянет** jiti/fastify/vite. Всё Node-only — в `nixo/server`. Если добавить Node-зависимость в файл, импортируемый из `./index.ts` или `./client/index.ts`, браузер упадёт с `Module "node:X" has been externalized for browser compatibility`.

`nixo` **не тянет** React в рантайм — поэтому `nixo inspect` грузит только pure TS.

### Структура пакета

```
packages/nixo/src/
├── index.ts                    # публичный API (server-safe)
├── cli.ts                      # команды dev / inspect / build / start
├── config.ts                   # defineNixoConfig, loadConfig
├── types.ts                    # NixoConfig, NixoRoute, FactoryMap, Manifest, ...
├── errors.ts                   # NixoError
├── define-route.ts             # defineRoute
├── define-global-loader.ts     # defineGlobalLoader
├── scanner.ts                  # обход clientDir, router.ts, *.loader.ts
├── route-tree.ts               # построение + валидация дерева
├── url.ts                      # computePath (parentId → URL)
├── manifest.ts                 # генерация Manifest
├── resolver.ts                 # resolveModule
│
├── client/                     # React-часть
│   ├── index.ts                # nixo/client
│   ├── slices/
│   │   ├── AbstractSlice.ts    # базовый store
│   │   ├── Slice.ts            # identity _initState
│   │   └── SliceRegistry.ts    # page + global registry
│   ├── context/
│   │   └── NixoProvider.tsx    # Context (createElement — без JSX)
│   └── hooks/
│       ├── useSlice.ts
│       ├── useStrictSlice.ts
│       ├── useSliceRef.ts
│       └── useSliceInternal.ts
│
├── server/                     # серверная часть
│   ├── create-server.ts        # Fastify + Vite (dev) / static (prod)
│   ├── ssr-handler.ts          # renderToPipeableStream + __NIXO_STATE__
│   ├── prefetch.ts             # getConfig → топосорт → loadData → hydrate
│   ├── module-loader.ts        # createDevModuleLoader + createProdModuleLoader
│   └── serialize.ts            # SerializedState
├── build/
│   ├── build.ts                # buildProject (client + server, собирает additionalModules)
│   ├── build-client.ts         # Vite client build
│   └── build-server.ts         # Vite SSR build (React externalize)
│
├── vite/
│   └── plugin.ts               # virtual:nixo/routes + virtual:nixo/client-entry
│
└── utils/
    ├── fs.ts
    ├── interpolate.ts
    └── css.ts                  # resolveCssMainPath
```

---

## ✅ Что реализовано

### Phase 1a — Сканер и манифест

- [x] Монорепо на pnpm (`../../pnpm-workspace.yaml`).
- [x] `defineNixoConfig` + `loadConfig` (jiti, дефолты, `ResolvedNixoConfig`).
- [x] `defineRoute` и `defineGlobalLoader` как публичные обёртки.
- [x] Сканер `clientDir/*/router.ts` → массив маршрутов.
- [x] Сканер `clientDir/**/*.loader.ts` → `FactoryMap`.
- [x] Построение дерева маршрутов (`parentId`), валидация:
  - уникальность `id`;
  - нет циклов;
  - ровно один `index: true`;
  - `type` резолвится в `config.layouts`;
  - A3-коллизии (global vs page) — ошибка.
- [x] URL-билдер (`computePath`).
- [x] Manifest generator (`kind` по использованию).
- [x] `resolveModule` (dev, поддержка `:export` и переменных).
- [x] CLI `nixo inspect`.
- [x] ESLint 9 (flat config) + JSDoc-warnings.
- [x] `@types/react`/`@types/react-dom` в dev.

### Phase 1b-1 — Fastify + Vite

- [x] `createNixoServer` (Fastify + Vite middleware в dev).
- [x] `reply.hijack()` — контроль над raw-ответом.
- [x] HMR-клиент Vite.
- [x] Раздача ассетов через `vite.middlewares` для не-HTML запросов.
- [x] `@fastify/static` заготовка для prod.

### Phase 1b-2 — SSR + гидратация

- [x] `renderToPipeableStream` + `Transform` для суффикса.
- [x] Поиск маршрута по URL, загрузка `template` и `layout` через `vite.ssrLoadModule`.
- [x] Virtual entry `virtual:nixo/client-entry` (hydrateRoot).
- [x] **Единый `NixoContext`** — `NixoProvider` и `SliceRegistry` загружаются через Vite (иначе два инстанса `createContext`).
- [x] 404 без React.
- [x] Fast Refresh preamble для `@vitejs/plugin-react` (обязательно при `appType: 'custom'`).

### Phase 1b-3a — Prefetch на SSR

- [x] `runPrefetch` — пайплайн:
  1. `getConfig(configParams, router)` → `FactoryMap`.
  2. A3-проверка `getConfig` vs `globalRegistry`.
  3. Топосорт с обнаружением циклов.
  4. `loadData(args, deps, { router })` для каждого узла.
  5. `new SliceClass().hydrate(data)` → регистрация в `SliceRegistry`.
- [x] `PrefetchResult` с `slices: Map<string, PrefetchSliceInfo>`.
- [x] `router` = `{ id, path, params, query, request }`.

### Phase 1b-3b — `__NIXO_STATE__`

- [x] `serializeState` — резолвинг `dataFactoryName` → Vite-путь + export.
- [x] `stringifyState` — JSON с экранированием `<` → `\u003c`.
- [x] Инъекция `<script>window.__NIXO_STATE__={...}</script>` перед entry.
- [x] На клиенте `hydrateSlicesFromState(registry)` **до** `hydrateRoot` — identity `Slice` из `__NIXO_STATE__.slices`.
- [x] Hydration match: `Users: 10` на сервере = `Users: 10` на клиенте.
- [x] Прямые `import()` в `virtual:nixo/routes` (glob не работает в virtual modules).

### Phase 1b-4 — Prod build + CSS

**Build:**
- [x] `nixo build` — клиентский бандл (`dist/client`) + SSR-бандл (`dist/server`).
- [x] `nixo start` — prod-сервер из `dist/`.
- [x] `virtual:nixo/ssr-entry` — генерирует `modules` map (template, layout, config, factory, global loader) + реэкспорт `NixoProvider`/`SliceRegistry`.
- [x] `createProdModuleLoader` — резолвинг `<file>:<export>` из `dist/server/entry.js` через namespace-модули.
- [x] `buildProject` — собирает `additionalModules` (вызывает `getConfig` каждого маршрута через jiti + все `dataFactoryName` из `*.loader.ts`).
- [x] React externalize в SSR (`react`, `react-dom`, `react/jsx-runtime`), `nixo/client` **бандлится** — иначе два `createContext`.
- [x] `nixo start` использует `@fastify/static` для `dist/client`.

**CSS:**
- [x] `css.main` в конфиге импортируется в клиентский entry (`import '/client/styles/main.css'`).
- [x] Per-component `import './view.css'` — работает автоматически (dev: HMR, prod: отдельный файл).
- [x] В prod SSR `<head>` содержит `<link rel="stylesheet">` для entry-CSS + CSS текущего template/layout.
- [x] `clientManifest` (`dist/client/.vite/manifest.json`) читается в `create-server.ts` и передаётся в `ssr-handler.ts`.
- [x] `config.vite` мёржится в `createServer`, `buildClient`, `buildServer` — Tailwind через `@tailwindcss/vite` работает без правок фреймворка.

**Исправления:**
- [x] `resolveSpec` принимает только **спеки** (`HomePage/view:View`), не Vite-пути. Двойной резолв ломал `path.relative` на Windows.
- [x] `modules` в SSR-бандле ключуется по `<file>` без `:export` — `createProdModuleLoader` находит namespace и берёт export.

### Phase 1b-5 — SPA, noSSR, enriched `_initState`, client-safe entry

**SPA-режим:**
- [x] `ssr: false` в `nixo.config.ts` — глобально SPA.
- [x] `?noSSR=true` — per-request escape hatch при `ssr: true`.
- [x] В SPA сервер отдаёт пустой `<div id="root"></div>` + entry + `window.__NIXO_SSR__=false`.
- [x] Endpoint `GET /__nixo/prefetch/:routeId` — клиент делает fetch, восстанавливает слайсы, `createRoot`.
- [x] В SSR: `hydrateRoot` + `window.__NIXO_SSR__=true` + готовый `__NIXO_STATE__`.
- [x] `window.__NIXO_SSR__` — флаг режима для клиента.

**Enriched `_initState` на клиенте:**
- [x] `collectFactoryModules(projectDir, routeTree, scanResult, clientDir)` — собирает `dataFactoryName` из `getConfig` каждого маршрута + `*.loader.ts`.
- [x] `virtual:nixo/routes` экспортирует `factoryLoaders: { [vitePath]: () => import(...) }`.
- [x] `loadSliceClass(modulePath, exportName)` — грузит прикладной класс слайса из factory-модуля.
- [x] `hydrateSlicesFromState` на клиенте: пробует `loadSliceClass`, при ошибке — fallback на generic `Slice` с warning'ом.
- [x] `factoryModules` попадают и в client build, и в SSR build.

**Разделение entry points (client-safe):**
- [x] `nixo` — pure TS: `defineNixoConfig`, `defineRoute`, `defineGlobalLoader`, `Slice`, `AbstractSlice`, `SliceRegistry`, `NixoError`, `computePath`, типы. **Без jiti/fastify/vite.**
- [x] `nixo/server` — `loadConfig`, `scan`, `buildRouteTree`, `buildManifest`, `createNixoServer`, `runPrefetch`, `serializeState`, `nixoPlugin`, `buildProject`, `collectFactoryModules`, `createDevModuleLoader`, `createProdModuleLoader`, `resolveModule`.
- [x] `nixo/client` — всё из `nixo` + `NixoProvider`, `useSlice`, `useStrictSlice`, `useSliceRef`, `useResourceContext`.
- [x] `defineNixoConfig` вынесен в `define-config.ts` (pure, без jiti).
- [x] `package.json → exports` содержит `.`, `./server`, `./client`.

**Dev CSS preload (FOUC fix):**
- [x] В dev `<head>` содержит `<link rel="stylesheet">` для `css.main` + прямые `import '*.css'` из template/layout.
- [x] `collectDirectCssImports(sourceFiles, projectDir)` — читает файлы, извлекает `import './x.css'` regex'ом, возвращает Vite-пути.
- [x] `BuildCssLinksContext` — типизированный контекст `buildCssLinks` (8 полей).
- [x] Ограничение: CSS **вложенных** компонентов (`Button.tsx` со своим CSS) в dev не прелоадится — Phase 3.

### Инфраструктура

- [x] CI-совместимые `pnpm lint`, `pnpm typecheck` — 0 ошибок.
- [x] ESLint flat config с JSDoc-правилами (warn, не блокируют).
- [x] Весь код документирован JSDoc.
- [x] Пример `../../examples/basic` демонстрирует все фичи.

___

### Phase 2 — Сервер и роутинг

#### 2.1. `defineServerRoutes` + `defineServerPlugins` ✅

**Пути в `nixo.config.ts`:**

```ts
export default defineNixoConfig({
  server: {
    routes: 'server/api/routes.ts',    // путь до файла с defineServerRoutes
    plugins: 'server/plugins',          // каталог Fastify-плагинов
  },
})
```

- `defineServerRoutes(ServerRoute[])` — массив объектов (D1).
- `ServerRoute = { method, path, handler, params?, middleware? }`.
- `handler`: `async (params, ctx) => Promise<unknown>`, `ctx = { request, reply, params }`.
- `defineServerPlugins({ order? })` в `server/plugins/index.ts` — явный порядок.
- Регистрация в `create-server.ts`: `plugins → /__nixo/prefetch → api → SSR`.

#### 2.2. Middleware — три реестра ✅

**Три разных контекста, три реестра, не смешиваются:**

| Реестр | Путь | `ctx` | Возврат |
|---|---|---|---|
| Client page | `client/middleware/*.ts` | `{ to, from }` (`NavTarget = { path, params, query, route }`) | `void \| { redirect }` |
| Server page | `server/middleware/*.ts` | `{ router, route, globalSlices }` | `void \| { redirect }` |
| Server API | `server/api-middleware/*.ts` | `{ request, reply }` (Fastify) | `void \| FastifyReply` |

**`MiddlewareDef`:**

```ts
interface MiddlewareDef {
  id: string
  handler: string                   // путь от projectDir
  params?: Record<string, unknown>
  side?: 'client' | 'server' | 'both' // только для глобальных
}
```

**`side: 'both'`** — файл экспортирует `client` и `server`, nixo берёт нужный по контексту.

**Глобальные** — в `nixo.config.ts`:

```ts
middleware: [
  { id: 'logger', handler: 'shared/middleware/logger', side: 'both' },
]
```

**Порядок:** глобальные → наследованные (по `parentId`) → локальные. `middleware: []` у ребёнка — отключает наследование.

**Side-фильтрация:** `runServerMiddleware` пропускает `side='client'` и `handler.startsWith('client/')`. Client-entry пропускает `side='server'` и `handler.startsWith('server/')`.

**Пайплайн SSR (C2):**

```
runGlobalPrefetch → server middleware → runPagePrefetch → render
```

**Client middleware:** вызываются только при `push`/`replace`/`back`, **не** при гидратации.

#### 2.3. Router API + `<Link>` + `<Outlet>` ✅

**Хуки:**

- `useRouter()` → `{ push(path), replace(path), back(), prefetch(path) }`.
- `useParams()` → `Record<string, string>`.
- `useQuery()` → `Record<string, string>`.
- `usePathname()` → `string`.

**`<Link href prefetch className>`** — перехватывает клик, `prefetch` по hover.

**`<Outlet/>`** — пока no-op (Phase 2.6 заменит на реальный slot).

**`NixoProvider`** держит `router` в React state:

```tsx
<NixoProvider sliceRegistry={...} initialRouter={...}>
```

При навигации: `disposePage() → fetch('/__nixo/prefetch/:routeId') → hydrateSlicesFromState → setRouter(newRouter)` → React re-render (без `createRoot` заново).

**`window.__NIXO_MIDDLEWARE__`** — глобальные client middleware, сериализуются в HTML в `<head>`.

#### 2.4. Разбивка prefetch ✅

- `runGlobalPrefetch(ctx)` → `Map<name, state>` (только `prefetchConfig.dependencies` + транзитивные global).
- `runPagePrefetch(ctx, globalStates)` → `PrefetchResult` (page-фабрики + глобальные для `__NIXO_STATE__`).
- `runPrefetch(ctx)` — facade для `/__nixo/prefetch` и SPA-навигации.

#### 2.5. Паттерн сериализации функций

`loadData` возвращает **только JSON-safe** данные. Функции, методы, computed — в `_initState`:

```ts
export class UserListSlice extends Slice<UserListState> {
  protected override _initState(result: unknown): UserListState {
    const { users } = result as { users: User[] }
    return {
      users,
      total: users.length,
      reload: () => { /* создаётся заново и на сервере, и на клиенте */ },
    }
  }
}
```

Иначе — hydration mismatch (`reload: function` на сервере vs `reload: undefined` на клиенте).

#### 2.6. `config.fastify` — проброс Fastify-опций ✅

```ts
export default defineNixoConfig({
  server: { port: 3000, host: '0.0.0.0' },  // nixo-специфика
  fastify: {                                  // прямо в Fastify(opts)
    logger: false,
    trustProxy: true,
    bodyLimit: 1048576,
  },
})
```

Тип — `FastifyServerOptions<RawServerDefault>` (фиксация HTTP/1, иначе TS выведет `Http2SecureServer` и сломает `FastifyInstance`).

Дефолт nixo: `{ logger: { level: 'info' } }`.

#### 2.7. Что ещё НЕ сделано (Phase 2)

- **Динамические сегменты** (`path: '/blog/:slug'`) — Шаг 4a.
- **Вложенные layouts** по `parentId` — Шаг 4b.
- **Реальный `<Outlet/>`** (slot) — Шаг 4c.
- **Error boundaries / loading / notFound** через `config.components` — Шаг 5.
- **`runtimeConfig`** — отложен.
- **Per-route CSS в SPA** — пока все CSS из манифеста.

---

## 🎯 Ключевые решения

| Область | Решение |
|---|---|
| Точка входа | «Путь A»: встроенный Fastify + опциональный `server/` |
| Папки | `client/` и `server/` по умолчанию; переопределяются в конфиге |
| SSR-движок | `renderToPipeableStream` + `hydrateRoot` |
| Роутинг | Скан `client/*/router.ts` + `defineRoute([...])` |
| URL | Цепочка `parentId → id`; `index: true` — единственный глобально |
| Layouts | Реестр в `nixo.config.ts`; вложенность через `<Outlet/>` (Phase 2) |
| Состояние | Свой store: `AbstractSlice` → `Slice`; `useSlice` / `useStrictSlice` / `useSliceRef` |
| Lifecycle слайсов | Page-scoped dispose на навигации; global живут сессию |
| Реестры | Два: `page` + `global`, поиск сначала в `page` |
| Данные | `getConfig` → топосорт `dependencies` → `loadData` → `hydrate` |
| Зависимости | `prefetchConfig.dependencies` (глобальные) + `dependencies` фабрик |
| A3-политика | Коллизии имён global vs page → ошибка сборки |
| Manifest | `kind` по использованию: `routes`, `component`, `config`, `factory`, `layout`, `globalLoader` |
| React | Последняя стабильная 19.x (`^19.0.0`), дедуп через pnpm |
| CSS | `css.main` в конфиге; per-component `import './x.css'` |
| Расширяемость | `meta`, generic `defineRoute<T>`, module augmentation `NixoRoute` |

---

## 📜 Публичный API

### `nixo` (client-safe)

```ts
// Конфиг
defineNixoConfig(config)

// Маршруты, данные
defineRoute(routes)
defineGlobalLoader(map)

// Слайсы
AbstractSlice<TState>
Slice<TState>
SliceRegistry

// JSON-RPC клиент
NixoService
Remote

// Prefetch (изоморфный)
runGlobalPrefetch(ctx, opts?)
runPagePrefetch(ctx, globalStates)
runPrefetch(ctx)

// URL
computePath(route, byId)

// Ошибки
NixoError
NixoRpcError

// Типы
NixoConfig, ResolvedNixoConfig, NixoRoute, NixoRouter,
FactoryDef, FactoryMap, FactoryImplementation, RouteTree,
Manifest, ManifestEntry, ModuleKind, ScanResult,
RpcOptions, RpcContext, RpcObjectDefinition, RpcMethodDefinition,
RpcParamsSchema, AuthRequirement, RpcExecutor,
ServiceOptions, CrudOp, IBinding, JsonRpcErrorPayload,
StandardSchemaV1, NixoClientRouter,
PrefetchContext, PrefetchRegistry, PrefetchResult, PrefetchSliceInfo
```

### `nixo/server`

```ts
// Конфиг
loadConfig(projectDir)

// Маршруты
defineServerRoutes(routes)
defineServerPlugins({ order? })

// RPC-объекты
defineObject(def)
scanRpcObjects(serverDir)
RpcRegistry
createRpcHandler(options)
createRpcExecutor(registry, config)
runWithRpcContext(ctx, fn)
getRpcContext()
parseCookieHeader(cookie)

// Middleware
loadMiddleware(def, projectDir, side)
runServerMiddleware(globalMiddleware, route, ctx, projectDir)

// Сканер, дерево, манифест
scan(clientDir)
buildRouteTree(modules, loaders, config)
buildManifest(scan, config, clientDir)
resolveModule(spec, vars?)

// Сервер
createNixoServer(options)
createDevModuleLoader(clientDir, vite)
createProdModuleLoader(serverEntryPath)

// Prefetch (серверный re-export)
runGlobalPrefetch, runPagePrefetch, runPrefetch

// Vite + build
nixoPlugin(options)
buildProject(options)
buildClient(options)
buildServer(options)
collectFactoryModules(projectDir, routeTree, scanResult, clientDir)

// API / plugins
loadServerRoutes(projectDir, routesPath)
loadServerPlugins(projectDir, pluginsDir)
registerServerRoutes(fastify, routes, projectDir)
registerServerPlugins(fastify, plugins)

// Сериализация
serializeState(slices, projectDir, clientDir)
stringifyState(state)
```

### `nixo/client`

```ts
// Всё из nixo + React:
export * from 'nixo'

NixoProvider
useResourceContext

useSlice<S>(key)
useStrictSlice<S>(key)
useSliceRef<S>(key)

useRouter(), useParams(), useQuery(), usePathname()

Link
Outlet
```

---

## ⚠️ Известные ограничения (актуально на Phase 1b-5)

### Функциональность

1. **Клиентская навигация** (`<Link>`, `router.push`) — не реализована, только полная перезагрузка страницы. → Phase 2.
2. **Динамические сегменты** (`/blog/:slug`) — в `router.ts` пока не поддерживаются, только статические `id`. → Phase 2.
3. **Вложенные layouts** — `<Outlet/>` внутри layout'а отсутствует; один layout на маршрут. → Phase 2.
4. **`server/api/`** — авторегистрация Fastify-плагинов из `serverDir/api/` не реализована. → Phase 2.
5. **`server/plugins/`** — пользовательские Fastify-плагины из `serverDir/plugins/` не сканируются. → Phase 2.
6. **`runtimeConfig`** — `public`/`private` переменные не сериализуются в HTML и не доступны в `loadData`. → Phase 2.
7. **Error boundaries / `loading.tsx`** — глобальные дефолты, per-route нет. → Phase 2.
8. **Per-route `ssr: false`** — только глобально или через `?noSSR=true`. → Phase 3.
9. **Стриминг данных** (React 19 `use` + Suspense) — не реализован, prefetch синхронный. → Phase 3.
10. **Refetch API** для глобальных loaders — нет, только перезагрузка. → Phase 3.
11. **Cross-page кэш фабрик** — отсутствует, при каждой навигации — заново. → Phase 3.

### CSS

12. **Dev FOUC для вложенных компонентов** — `collectDirectCssImports` не рекурсирует; CSS `Button.tsx` в dev не прелоадится. → Phase 3.
13. **CSS в SPA (prod)** — отдаём **все** CSS из манифеста, без per-route оптимизации. → Phase 2.

### Данные

14. **Сериализация функций** — `JSON.stringify` теряет функции в `state`. Enriched `_initState` восстанавливает их на клиенте, но generic-slice — нет. → Phase 3 (`devalue`).
15. **`getConfig` вызывается дважды** — в `collectFactoryModules` (build/prepare) и в `runPrefetch` (request). Если `getConfig` нечистый (side effects, чтение env) — может ломаться. → Phase 3.
16. **`dataFactoryArguments`** — статические, без доступа к `router.params`/`query` на этапе `build`. → Phase 3.

### Совместимость

17. **jiti 2.4.2** — `jsx: true` в отдельных конфигурациях игнорируется (баг), поэтому framework-файлы `.tsx` используют `createElement`, не JSX. → в `bin/nixo.mjs` оставлен `jsx: true`, но framework не полагается на него.
18. **Windows + pnpm** — Ctrl+C иногда не убивает дочерние процессы `nixo dev` → `EADDRINUSE`. → `Get-Process node | Stop-Process -Force`.

---
### Phase 2 — Сервер, роутинг, JSON-RPC 2.0

#### 2.1. `defineServerRoutes` + `defineServerPlugins`

**Пути в `nixo.config.ts`:**

```ts
export default defineNixoConfig({
  server: {
    routes: 'server/api/routes.ts',    // путь до файла с defineServerRoutes
    plugins: 'server/plugins',          // каталог Fastify-плагинов
  },
})
```

- `defineServerRoutes(ServerRoute[])` — массив объектов.
- `ServerRoute = { method, path, handler, params?, middleware? }`.
- `handler`: `async (params, ctx) => Promise<unknown>`, `ctx = { request, reply, params }`.
- `defineServerPlugins({ order? })` в `server/plugins/index.ts` — явный порядок (опционально).
- Порядок регистрации: `plugins → RPC /service → API routes → SSR catch-all`.

#### 2.2. Middleware — три реестра

Три разных контекста, три реестра, **не смешиваются**:

| Реестр | Путь | `ctx` | Возврат |
|---|---|---|---|
| Client page | `client/middleware/*.ts` | `{ to, from }` (`NavTarget = { path, pathname, params, query, route }`) | `void \| { redirect }` |
| Server page | `server/middleware/*.ts` | `{ router, route, globalSlices }` | `void \| { redirect }` |
| Server API | `server/api-middleware/*.ts` | `{ request, reply }` (Fastify) | `void \| FastifyReply` |

**`MiddlewareDef = { id, handler, params?, side? }`.**

Глобальные — в `nixo.config.ts → middleware[]`:
```ts
middleware: [
  { id: 'logger', handler: 'shared/middleware/logger', side: 'both' },
]
```

`side: 'both'` — файл экспортирует `client` и `server`, nixo берёт нужный по контексту.

**Порядок:** глобальные → наследованные по `parentId` → локальные. `middleware: []` у ребёнка — отключает наследование.

**Side-фильтрация:**
- `runServerMiddleware`: пропускает `side='client'` и `handler.startsWith('client/')`.
- Client-entry: пропускает `side='server'` и `handler.startsWith('server/')`.

**Пайплайн SSR:** `runGlobalPrefetch → server middleware → runPagePrefetch → render`.
**Client middleware:** только при `push`/`replace`/`back`, **не** при гидратации.

#### 2.3. Router API + `<Link>` + `<Outlet>`

**Хуки:**

- `useRouter()` → `{ push(path), replace(path), back(), prefetch(path) }`.
- `useParams()` → `Record<string, string>`.
- `useQuery()` → `Record<string, string>`.
- `usePathname()` → `string`.

**`<Link href prefetch className>`** — перехватывает клик, `prefetch` по hover.

**`<Outlet/>`** — пока no-op (Phase 2.6 заменит на реальный slot).

**`NixoProvider` — controlled:**

```tsx
<NixoProvider sliceRegistry={...} router={currentRouter}>
```

`router` — обычный prop, не `useState`. При навигации client-entry вызывает `rootRef.render(<NixoProvider router={newRouter} ...>)` — React корректно обновляет контекст.

**`window.__NIXO_MIDDLEWARE__`** — глобальные client middleware, сериализуются в HTML в `<head>`.

**Навигация:**
- `router.push('/about?tab=features')` → `buildNavTarget` использует `URL.pathname` для матчинга, `URL.searchParams` для query. SPA-переход без перезагрузки.
- `history.pushState` после prefetch.
- `popstate` → `navigate(window.location.pathname, 'replace')`.

#### 2.4. Prefetch: SSR + SPA (изоморфный)

`shared/prefetch.ts` — pure TS, используется **и сервером, и клиентом**.

- `runGlobalPrefetch(ctx, { skipExisting? })` → `Map<name, state>` (только `prefetchConfig.dependencies` + транзитивные global).
- `runPagePrefetch(ctx, globalStates)` → `PrefetchResult` (page-фабрики + глобальные для `__NIXO_STATE__`).
- `runPrefetch(ctx)` — facade.

`PrefetchContext = { route, globalRegistry, loadModule, registry, router }` — без `config` и `clientDir`.

**SSR:**
```
runGlobalPrefetch → server middleware → runPagePrefetch → serializeState → __NIXO_STATE__ → hydrateRoot
```

**SPA (в client-entry):**
```
client middleware → disposePage → runGlobalPrefetch({skipExisting:true}) → runPagePrefetch → rootRef.render
```

**`loadModule` инжектится:**
- Сервер (dev): `vite.ssrLoadModule`.
- Сервер (prod): `createProdModuleLoader(dist/server/entry.js)`.
- Клиент: `resolveModule(spec)` из `virtual:nixo/routes` (`moduleLoaders`).

**`/__nixo/prefetch` — удалён.** SPA-навигация выполняет `loadData` на клиенте через `NixoService`.

#### 2.5. Паттерн сериализации

`loadData` возвращает **только JSON-safe** данные. Функции/computed — в `_initState`:

```ts
export class UserListSlice extends Slice<UserListState> {
  protected override _initState(result: unknown): UserListState {
    const { users } = result as { users: User[] }
    return {
      users,
      total: users.length,
      reload: () => { /* создаётся заново и на сервере, и на клиенте */ },
    }
  }
}
```

Иначе — hydration mismatch.

#### 2.6. `config.fastify`

```ts
export default defineNixoConfig({
  server: { port: 3000, host: '0.0.0.0' },  // nixo-специфика
  fastify: {                                  // прямо в Fastify(opts)
    logger: false,
    trustProxy: true,
    bodyLimit: 1048576,
  },
})
```

Тип — `FastifyServerOptions<RawServerDefault>` (фиксация HTTP/1, иначе TS выведет `Http2SecureServer` и сломает `FastifyInstance`).

Дефолт nixo: `{ logger: { level: 'info' } }`.

#### 2.7. JSON-RPC 2.0 (`/service`)

**Опции:**

```ts
export default defineNixoConfig({
  rpc: {
    enabled: true,              // по умолчанию true
    url: '/service',            // по умолчанию '/service'
    extendContext: async (req) => ({
      user: await getUser(req),
      db: getDb(),
    }),
  },
})
```

**`defineObject` — один объект на файл `server/**/*.meta.ts`** (рекурсивный скан):

```ts
// server/users/Users.meta.ts
import { defineObject } from 'nixo/server'
import type { RpcContext } from 'nixo/server'

export default defineObject({
  name: 'Users',
  description: 'Пользователи',
  methods: {
    List: {
      description: 'Список',
      params: v.object({ limit: v.optional(v.number()) }),  // Standard Schema
      auth: true,
      handler: async (params, ctx) => ctx.db.users.findMany({ take: params.limit }),
    },
    Count: {
      internal: true,  // доступен только через ctx.call
      handler: async (params, ctx) => {
        const users = await ctx.call<unknown[]>('Users.List', { limit: 5 })
        return { count: users.length }
      },
    },
  },
})
```

**`RpcContext`:**

```ts
interface RpcContext {
  requestId: string                    // из X-Request-Id или UUID
  call: <R>(method, params?) => Promise<R>  // JSON-RPC через registry
  [key: string]: unknown               // из config.rpc.extendContext
}
```

**Endpoint `POST /service`:**
- JSON-RPC 2.0 (одиночный + batch).
- `id` из запроса, либо fallback: **1** для одиночного, **1,2,3...** для batch.
- Валидация `params` (Standard Schema) → `-32602`.
- `auth: true` → нужен `ctx.user`; `auth: { roles }` → проверка роли → `-32001`.
- `internal: true` → `-32601` снаружи.
- `requestId` → `X-Request-Id` в ответе.
- Коды: `-32600`, `-32601`, `-32602`, `-32603`, `-32001`.

#### 2.8. `NixoService` (изоморфный JSON-RPC клиент)

```ts
import { NixoService } from 'nixo'

const users = await new NixoService({
  endpoint: 'Users',
  binding: { query: 'List' },  // опционально
}).query({ limit: 10 })

const one = await new NixoService({ endpoint: 'Users' }).read({ id: 1 })
const custom = await new NixoService({ endpoint: 'Users' }).call('Read', { id: 1 })
```

**`ServiceOptions = { url?, endpoint?, method?, binding?, timeout? }`.**
**`binding`: `{ read?, query?, create?, update?, destroy? }`.**
**Дефолт:** `read → Read`, `query → List`, `create → Create`, `update → Update`, `destroy → Delete`.

**Изоморфность:**
- Клиент: `fetch('/service', { method: 'POST', body })`.
- Сервер (SSR): executor из ALS — **прямой вызов handler'а из реестра, без HTTP**.
- Headers текущего запроса (cookies, auth) — из ALS на сервере, браузер сам на клиенте.

**`Service.call(method, params)` → `R`** (распаковка `result`, ошибки → `NixoRpcError`).
**`service.query/read/create/update/destroy` → `R`**.
**`service.callRaw(method, params)` → `Response`** (низкоуровневый).

#### 2.9. Два реестра объектов на клиенте

При навигации клиент сам выполняет prefetch через `NixoService` — запросы идут на **ваш** `/api/*` или `/service`, никогда на `/__nixo/prefetch`.

**Network при клике `/` → `/about`:**
- `POST /service` — **есть** (если `loadData` использует `NixoService`).
- `GET /__nixo/prefetch/*` — **нет** (endpoint удалён, 404).

#### 2.10. Динамические сегменты — `slug` и `path`

Два способа задать URL с параметрами. **Взаимоисключающие.**

**`slug: string[]`** — добавляется к цепочке `parentId → id`:

```ts
// /blog/<slug>, params.slug = '<slug>'
{
  id: 'blog',
  slug: ['/regex:[a-z0-9-]+'],
  // ...
}

// /user/123, params.id = '123'
{
  id: 'user',
  slug: [':id'],
  // ...
}

// /posts/list (литерал, без params)
{
  id: 'posts',
  slug: ['list'],
}

// /catalog/42/foo, params.slug = '42', params.sub = 'foo'
{
  id: 'catalog',
  slug: ['/regex:[0-9]+', ':sub'],
}
```

Правила сегмента:
- `':param'` — именованный параметр, `params.param = value`.
- `'/regex:body'` — nixo **сам** оборачивает в `^(body)$`, имя параметра — `slug`, `slug1`, `slug2` (если несколько regex).
- `'literal'` — статический сегмент.

**`path: string`** — абсолютный паттерн с `:param`:

```ts
// /blog/:slug (полный контроль над URL)
{
  id: 'blog-post',
  path: '/blog/:slug',
  // ...
}
```

**Правила:**
- Оба одновременно — `NixoError`.
- Regex-коллизии между маршрутами (например, `:slug` vs `:id` при одинаковой структуре) — `NixoError`.
- `matchRoute(url, routeTree.compiled)` — ищет по regex, возвращает `{ routeId, params }`.

**`useParams()`** в компоненте — `Record<string, string>` текущего маршрута.

**Title при SPA-навигации** обновляется автоматически (`document.title = route.title`).

#### 2.11. Вложенные layouts по `parentId` + `<Outlet/>`

Layout-цепочка строится по `parentId`: `type` каждого маршрута в цепочке применяется как слой.

```ts
// HomePage/router.ts — корень (index)
{ id: 'home', index: true, type: 'main', /* ... */ }

// AdminPage/router.ts — ребёнок home
{ id: 'admin', parentId: 'home', type: 'admin', /* ... */ }
```

→ URL `/admin`, layout-цепочка: `main → admin → template`.

**`RouteTree.layoutChains: Map<string, string[]>`** — вычисляется в `buildRouteTree` (обход `parentId` от корня к листу, сбор `type`).

**Рендер через `renderLayoutChain(page, layouts)`** из `nixo/client`:

```tsx
// Main.tsx (layout)
import { Outlet } from 'nixo/client'

export default function Main(): JSX.Element {
  return (
    <div>
      <Header />
      <main><Outlet /></main>
      <Footer />
    </div>
  )
}
```

**Два способа получить дочерний контент в layout:**
- `<Outlet />` — через React Context (`OutletContext`).
- `props.children` — как обычный React-паттерн.

Оба работают одновременно (Layout получает `children` и контекст `<Outlet/>` с тем же узлом).

**Изоморфность:**
- SSR: `ssr-handler.ts` загружает все `Layouts` цепочки, `renderLayoutChain(child, Layouts)`.
- Клиент: `loadRouteModules` возвращает `{ Template, Layouts }`, entry делает `renderLayoutChain`.
- `virtual:nixo/routes` содержит `layoutPaths: { [type]: { path, export } }`.
- `virtual:nixo/ssr-entry` реэкспортирует `renderLayoutChain` из `nixo/client`.

#### 2.12. Per-route `ssr: false`

```ts
// nixo.config.ts
export default defineNixoConfig({ ssr: true })

// AdminPage/router.ts
export default defineRoute([
  {
    id: 'admin',
    type: 'admin',
    ssr: false,   // ← SPA: без SSR-рендера
    // ...
  },
])
```

**Логика:**

```ts
const globalSSR = config.ssr !== false
const routeSSR = globalSSR ? route.ssr !== false : false
const shouldSSR = routeSSR && query.noSSR !== 'true'
```

**Правила:**
- `config.ssr: false` — весь проект SPA, `route.ssr: true` игнорируется.
- `route.ssr: false` — только эта страница SPA, остальные SSR.
- `index: true + ssr: false` — `NixoError` (индексная страница должна быть SSR).
- `?noSSR=true` — escape hatch, работает независимо.

**Что происходит при `route.ssr: false`:**
- Сервер отдаёт каркас: `<div id="root"></div>` + `__NIXO_SSR__=false` + пустой `__NIXO_STATE__`.
- Server middleware **не вызывается** — auth на таких страницах через client middleware.
- Клиент делает `clientPrefetch` (через `NixoService` / `fetch`) + `createRoot`.
- `<Loading/>` показывается во время prefetch.

#### 2.13. Error boundaries / Loading / Not Found

**`nixo.config.ts`:**

```ts
export default defineNixoConfig({
  components: {
    error: 'shared/ErrorBoundary:ErrorBoundary',
    loading: 'shared/Loading:Loading',
    notFound: 'shared/NotFound:NotFound',
  },
})
```

Пути от `clientDir` в формате `<file>:<export>` или `<file>` (default).

**Дефолты** (если не задано): `NixoErrorBoundary`, `NixoLoading`, `NixoNotFound` из `nixo/client`.

**`error`** — React Error Boundary, оборачивает дерево страницы. Fallback получает `{ error }`.

```tsx
// client/shared/ErrorBoundary.tsx
export function ErrorBoundary(props: { error: Error }): JSX.Element {
  return <div className="...">Что-то пошло не так: {props.error.message}</div>
}
```

Ловит:
- ошибки в `View()` (SSR через `renderToPipeableStream`, клиент через `NixoErrorBoundary`).
- **НЕ** ловит ошибки в `loadData` — они обрабатываются в `clientPrefetch` (`catch` в `navigate` / `main`), рендерится `ErrorComp` **напрямую**, не через boundary.

**`loading`** — показывается во время первого SPA-prefetch (`?noSSR` / `ssr: false`).

```tsx
// client/shared/Loading.tsx
export function Loading(): JSX.Element {
  return <div>Загружаем страницу…</div>
}
```

**`notFound`** — кастомная 404.

```tsx
// client/shared/NotFound.tsx
export function NotFound(): JSX.Element {
  return <div>404 · {usePathname()}</div>
}
```

**Как работает 404:**
- SSR: `renderToString(<NixoProvider><NotFound/></NixoProvider>)` → HTML в `<div id="root">`.
- Клиент: `hydrateRoot(<NixoProvider><NotFound/></NixoProvider>)` — **та же структура**, hydration без mismatch.
- `__NIXO_SSR__=true`, `__NIXO_STATE__={"version":1,"slices":{}}`.

**Ключевой момент:** entry **не затирает** SSR-рендер дефолтным `rootEl.textContent = '404 Not Found'`. Вместо этого — `hydrateRoot` с тем же деревом.

**Loading в SPA:** при `?noSSR` / `ssr: false` entry сначала рендерит `<Loading/>`, потом `clientPrefetch`, потом финальный рендер. На localhost prefetch быстрый — Loading может не успеть отрисоваться (это норма, он для медленных сетей/API).

#### 2.14. `System.Describe` + рекурсивный CSS-scan (Phase 4.1)

**`System.Describe`** — встроенный JSON-RPC метод. Возвращает список объектов и методов (`Users.List`, `System.Ping`, ...) с описаниями, `hasParams`, `auth`, `internal`. Handler'ы **не** сериализуются.

```bash
curl -X POST http://127.0.0.1:3000/service \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"System.Describe","id":1}'
```

**Ожидаемый ответ:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "objects": [
      {
        "name": "Users",
        "description": "Пользователи",
        "methods": [
          {
            "name": "List",
            "fullName": "Users.List",
            "description": "Список пользователей",
            "hasParams": true,
            "auth": "public",
            "internal": false,
            "meta": {}
          }
        ]
      }
    ]
  },
  "id": 1
}
```

Обрабатывается в `processOne` (в `server/rpc/process.ts`) **до** `registry.getMethod`, поэтому не требует `*.meta.ts`.

**Рекурсивный `collectDirectCssImports`** (dev): обходит граф `import` от `template` и `layout`, собирает `import './x.css'` со всех уровней. Защита от циклов (`visited`) + `MAX_DEPTH = 30`. Решает FOUC для **вложенных** компонентов (Button со своим CSS).

#### 2.15. `devalue` — богатые типы в `__NIXO_STATE__` (Phase 4.2)

`__NIXO_STATE__` → **`__NIXO_STATE_STR__`** (JSON-строка от `devalue.stringify`).

**Поддержка:** `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, `Infinity`, `-0`, циклические ссылки. **Не** сериализуются: функции, классы (только plain object), `Symbol`.

**Установка:**

```bash
pnpm --filter nixo add devalue
```

**Сервер** (`server/serialize.ts`):
```ts
import { stringify as devalueStringify } from 'devalue'

export function stringifyState(state: SerializedState): string {
  return devalueStringify(state).replace(/</g, '\\u003c')
}
```

**HTML** (`ssr-handler.ts`):
```html
<script>window.__NIXO_STATE_STR__="[{...devalue-encoded...}]"</script>
```

`JSON.stringify(serializedStateJson || '')` — оборачивает **строку** в JS-строковый литерал.

**Клиент** (`virtual:nixo/client-entry`):
```js
import { devalueParse } from 'nixo/client'

const stateObj = window.__NIXO_STATE_STR__
  ? devalueParse(window.__NIXO_STATE_STR__)
  : undefined
await hydrateSlicesFromState(stateObj, sliceRegistry)
```

`devalueParse` **только** из `nixo/client` (реэкспорт в `packages/nixo/src/client/index.ts`):
```ts
export { parse as devalueParse, stringify as devalueStringify } from 'devalue'
```

**Правило для прикладника:** `loadData` возвращает JSON-safe + богатые типы (`Map`, `Date`, ...). **Не** возвращать функции/классы. Функции/computed — в `_initState` слайса.

**Пример:**
```ts
// loadData
async loadData() {
  return {
    id: 1,
    permissions: new Map([['read', true], ['write', false]]),
    createdAt: new Date(),
  }
}

// На клиенте после hydrate:
slice.getState().permissions instanceof Map  // → true
slice.getState().createdAt instanceof Date   // → true
```

**Подводные камни:**
- Если `loadData` вернул функцию — `devalue.stringify` бросит `Cannot stringify arbitrary non-POJOs (function)`.
- Если `loadData` вернул инстанс класса — тоже ошибка. Сериализуйте `{ ...instance }` (plain object).
- `devalueParse` должен быть **одной версии** на сервере и клиенте. Проверяйте `pnpm ls -r devalue` — одна версия.
- В **entry** импорт `devalueParse` — **только** из `nixo/client`. Прямой `import from 'devalue'` в virtual module не резолвится (bare specifier).

#### 2.16. Cross-page кэш в `NixoService` (Phase 4.3)

Кэш **на уровне `NixoService`**, не `PrefetchResult`. Один вызов `service.query(...)` кэшируется для всех страниц — `userInfo` не перезапрашивается при навигации.

**Включение:**

```ts
const usersService = new NixoService({
  endpoint: 'Users',
  binding: { query: 'List' },
  cache: 30000,  // TTL 30 сек. Не задан / 0 — кэш выключен.
})
```

**Per-call override:**

```ts
await service.query({ limit: 10 })                           // TTL из конструктора
await service.call('List', { limit: 10 }, { cache: 60000 })  // 60 сек
await service.call('List', { limit: 10 }, { cache: false })  // без кэша
```

**Инвалидация:**

```ts
service.invalidate()                     // весь кэш endpoint
service.invalidate('List')               // все List
service.invalidate('List', { limit: 10 }) // точечно
NixoService.invalidateAll()              // весь клиентский кэш (static)
```

**Ключ кэша:** `${endpoint}.${method}:${devalueStringify(params)}`.

**Изоморфность:**
- **Клиент:** модульный `Map` — кросс-страничный, кросс-инстансный.
- **Сервер (SSR):** per-request `Map` в ALS (`runWithRpcContext({ ..., cache: new Map() })`). Не утекает между пользователями.
- **Сервер вне SSR** (build, скрипты): кэш выключен.

**`<Link prefetch>` — теперь реальный:** при hover запускает `clientPrefetch` (с `tempRegistry`), заполняя кэш `NixoService`. Клик → данные из кэша → мгновенный переход.

**Пример:**

```tsx
const usersService = new NixoService({
  endpoint: 'Users',
  binding: { query: 'List' },
  cache: 30000,
})

// loadData
async loadData(args) {
  const users = await usersService.query<{ limit: number }, User[]>({
    limit: args.limit as number,
  })
  return { users }
}

// В компоненте — кнопка invalidate
<button onClick={() => usersService.invalidate()}>
  Invalidate cache
</button>
```

**Ожидаемое поведение:**

| Действие | Network |
|---|---|
| Первый `/` | `POST /service` (Users.Read + Users.List) |
| `/` → `/about` → `/` | **0 запросов** (кэш) |
| Ждём 30 сек → `/about` → `/` | `POST /service` снова (TTL истёк) |
| После `invalidate()` → `/about` → `/` | `POST /service` снова |
| Hover на `<Link prefetch>` | `POST /service` **до** клика |

**Правила:**
- `cache` задан в конструкторе — все вызовы кэшируются.
- `cache: false` в `call` — этот вызов без кэша.
- Кэш на сервере — **per-request** (ALS). Никогда не шарится между пользователями.
- Auto-invalidate при `create`/`update`/`destroy` — **не делаем** (Phase 5, если понадобится).

---

## 🗺 Roadmap

### Phase 3 — Роутинг и layouts (ближайшее)

- [ ] Динамические сегменты: `NixoRoute.path: '/blog/:slug'`, `matchRoute(url) → { routeId, params }`.
- [ ] Наследование layouts по `parentId`: `layoutChain: string[]`.
- [ ] Реальный `<Outlet/>` (slot через Context).
- [ ] `config.components: { error, loading, notFound }`.
- [ ] Per-route `ssr: false`.

### Phase 4 — Данные

- [ ] Стриминг данных (React 19 `use` + Suspense).
- [ ] `devalue` для сериализации функций.
- [ ] Cross-page кэш фабрик.
- [ ] Рекурсивный `collectDirectCssImports`.
- [ ] `System.Describe` для JSON-RPC.

### Phase 5 — RSC

### Phase 6 — DX

---

## 🧪 Проверки

```bash
# Установка (из корня монорепо)
pnpm install

# Линт и типы
pnpm lint
pnpm typecheck

# Дамп маршрутов и манифеста
pnpm inspect:basic

# Dev-сервер примера
pnpm dev:basic
# → http://localhost:3000

# С диагностикой __NIXO_STATE__
NIXO_DEBUG=1 pnpm dev:basic
# → [nixo] __NIXO_STATE__ length=234 slices=UserList
```

---

## ⚠️ Известные ограничения

### Функциональность

1. **Динамические сегменты** (`/blog/:slug`) — не реализованы. → Phase 3.
2. **Вложенные layouts** — один layout на маршрут. → Phase 3.
3. **`<Outlet/>`** — пока no-op (заглушка). → Phase 3.
4. **Error boundaries / loading / notFound** через `config.components` — не реализованы. → Phase 3.
5. **Per-route `ssr: false`** — только глобально или через `?noSSR=true`. → Phase 4.
6. **Стриминг данных** (React 19 `use` + Suspense) — не реализован. → Phase 4.

### JSON-RPC

7. **Notifications** (без `id`, без ответа) — не поддержаны. Fallback: `id = 1..N`.
8. **System.Describe** — не реализован.
9. **`ctx.call` в `loadData`** — не доступен; `loadData` использует `NixoService` напрямую.
10. **`RpcContext.call` на SSR** — прямой вызов handler'а (без HTTP), но `extendContext` получает только `{ headers }`, не FastifyRequest.

### CSS / Dev

11. **Dev FOUC для вложенных компонентов** — `collectDirectCssImports` не рекурсирует.
12. **CSS в SPA (prod)** — все CSS из манифеста, без per-route оптимизации.

### Данные

13. **`getConfig` вызывается дважды** — при build (`collectFactoryModules`) и в рантайме.
14. **Сериализация функций** — `JSON.stringify` теряет; восстанавливается через `_initState`.

### Инфраструктура

15. **Windows + pnpm:** Ctrl+C не убивает дочерние процессы. → `Get-Process node | Stop-Process -Force`.
16. **`localhost` на Windows** резолвится в `::1`, а Fastify на `0.0.0.0` — IPv4. Используйте `127.0.0.1` или `host: '::'`.
---

## 📚 Соглашения

- **Весь код документируется JSDoc** (`@param`, `@returns`, `@throws`).
- **Не-тривиальная логика** — inline-комментарии (почему, а не что).
- **Публичный API** — только через `src/index.ts` и `packages/nixo/src/client/index.ts`.
- **Framework `.tsx`** — через `createElement`, не JSX (см. `NixoProvider.tsx`), чтобы не зависеть от JSX runtime загрузчика.
- **Ошибки фреймворка** — через `NixoError`.
- **Стилистические JSDoc-правила** (`tag-lines`, `no-undefined-types`) — отключены.

---

## 📄 Лицензия

TBD.
