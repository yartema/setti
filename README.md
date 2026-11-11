# Tusten Framework

> **Fullstack React framework** on **React 19** + **Fastify 5** + **Vite**.

[![npm beta](https://img.shields.io/npm/v/@tusten/core/beta.svg?label=npm%20beta&color=blue)](https://www.npmjs.com/package/@tusten/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000.svg)](https://fastify.dev)
[![Vite](https://img.shields.io/badge/Vite-6%20%7C%208-646CFF.svg)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org)

**tusten** — мета-фреймворк уровня Nuxt/Next, который собирается из трёх проверенных инструментов: React, Fastify, Vite. Устанавливается как зависимость, сканирует `client/`, строит карту маршрутов, поднимает сервер с SSR/SPA и JSON-RPC 2.0 — без магии, без RSC, без Server Actions.

> ⚠️ **Beta (`@tusten/core@0.2.0-beta.4`).**
>
> - Установка: `pnpm add @tusten/core@beta`
> - Импорт: `import { defineConfig } from '@tusten/core'`
> - Bin: `tusten dev`, `tusten build`, `tusten start`, `tusten inspect`
> - **API стабилизируется**, breaking changes — только в минорных версиях.
> - **Не для production** без тестов и ревью.
> - Следите за [Releases](https://github.com/yartema/tusten-framework/releases).

---

## ✨ Что внутри

- **SSR из коробки** — `renderToPipeableStream` + `hydrateRoot`, стриминг, единый React Context между сервером и клиентом.
- **SPA по требованию** — глобально (`ssr: false`), per-route (`route.ssr: false`) или через `?noSSR=true` для отладки.
- **Файловый роутинг** — `client/*/router.ts` → `defineRoute([...])`. Динамические сегменты через `slug: ['/regex:[a-z0-9-]+']` или `path: '/blog/:slug'`.
- **Вложенные layouts** — по `parentId`, рендер цепочкой `root → admin → page`. `<Outlet/>` или `props.children` на выбор.
- **SEO / meta** — `metaConfig` на маршруте: статика (`title`, `meta[]`, `microdata`) + динамика через `readMethod` (JSON-RPC) или `getMetaCallback`. Плюс `usePageMeta` для компонента. JSON-LD из коробки.
- **JSON-RPC 2.0 из коробки** — `defineObject` в `server/**/*.meta.ts`, endpoint `/service`, batch, валидация через Standard Schema (valibot / zod / arktype), auth, `ctx.call`, `System.Describe`.
- **Три реестра middleware** — client-page, server-page, server-api. Не смешиваются, наследуются по `parentId`.
- **Слайсы** — собственный реактивный store (`Slice` / `AbstractSlice` / `SliceRegistry`). Page-scoped и global, авто `disposePage()` при навигации, `useSlice` / `useStrictSlice` / `useSliceRef`.
- **Cross-page кэш в `Service`** — TTL, `invalidate()`, LRU-эвикция (`cacheMaxEntries`, default 500), `<Link prefetch>` заполняет кэш по hover. Не на уровне страниц — на уровне вызовов.
- **`devalue` для сериализации** — `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, циклы переживают SSR и восстанавливаются на клиенте.
- **Client-safe разделение** — три точки входа: `@tusten/core` (pure TS), `@tusten/core/server` (Node-only), `@tusten/core/client` (React). `@tusten/core` не тянет jiti/fastify/vite.
- **Error boundaries / Loading / Not Found** — через `config.components`, с дефолтами `RootErrorBoundary` / `RootLoading` / `RootNotFound`.
- **Prod build** — `tusten build` → `dist/client` + `dist/server`. `tusten start` — Fastify + статика.
- **269 unit-тестов** (Vitest) — ядро покрыто на 90%+, CI на GitHub Actions.

---

## 🚀 Быстрый старт

### Из npm

```bash
mkdir my-app && cd my-app
pnpm init -y
pnpm add @tusten/core@beta react react-dom fastify vite @vitejs/plugin-react
pnpm add -D typescript @types/react @types/react-dom
```

Создайте `tusten.config.ts`:

```ts
import { defineConfig } from '@tusten/core'

export default defineConfig({
    ssr: true,
    layouts: { main: './layouts/Main.tsx' },
    css: { main: 'styles/main.css' },
})
```

Создайте `client/HomePage/router.ts`, `client/HomePage/view.tsx`, `client/layouts/Main.tsx` (примеры ниже) и запустите:

```bash
pnpm exec tusten dev
# → http://localhost:3000
```

### Из монорепо (для разработки)

```bash
git clone https://github.com/yartema/tusten-framework.git
cd tusten-framework
pnpm install
pnpm dev:basic
```

Откройте **http://localhost:3000** — демо на Tailwind v4 с 4 страницами (Home / About / Blog / Admin), API, JSON-RPC, meta и вложенными layouts.

**Другие команды:**

```bash
pnpm lint                                        # ESLint
pnpm typecheck                                   # tsc --noEmit
pnpm test                                        # Vitest (269 тестов)
pnpm inspect:basic                               # dump маршрутов и RPC-методов
pnpm build:basic                                 # prod-сборка
pnpm start:basic                                 # prod-сервер
```

---

## 🧑‍💻 Как это выглядит

### Маршрут

```ts
// client/HomePage/router.ts
import { defineRoute } from '@tusten/core'

export default defineRoute([
    {
        id: 'home',
        index: true, // URL: /
        type: 'main', // layout из config.layouts
        middleware: [{ id: 'auth', handler: 'client/middleware/auth' }],
        metaConfig: {
            title: 'Главная',
            meta: [{ name: 'description', content: 'Home page' }],
        },
        contentConfig: {
            workspaceConfig: { template: 'HomePage/view:View' },
            prefetchConfig: {
                configLoader: 'HomePage/Factories/Root',
                dependencies: ['userInfo'], // глобальный loader
            },
        },
    },
])
```

**Динамический маршрут с meta из RPC:**

```ts
// client/BlogPage/router.ts
export default defineRoute([
    {
        id: 'blog',
        slug: ['/regex:[a-z0-9-]+'],
        type: 'main',
        metaConfig: {
            readMethod: 'Blogs.ReadMetaInfo', // вернёт { title, meta[], microdata }
            cache: 60_000,
            meta: [
                // статика мержится: [...static, ...fromMethod]
                { name: 'og:type', content: 'article', attribute: 'property' },
            ],
        },
        contentConfig: {/* ... */},
    },
])
```

### SEO / meta

Три уровня (по убыванию приоритета):

1. **`readMethod`** — путь до JSON-RPC метода (`'Blogs.ReadMetaInfo'`). Вызывается с полным URL. Возвращает `{ title?, meta?: MetaTag[], microdata?: object }`.
2. **`getMetaCallback`** — путь до функции `(metaConfig) => Promise<MetaResult>`. Вызывается, если `readMethod` не задан.
3. **Статика** в `metaConfig`: `title`, `meta: MetaTag[]`, `microdata`.

**Мерж статики и метода:**

- `meta` — конкатенация: `[...static, ...fromMethod]` (статика первая).
- `microdata` — shallow merge: `{ ...static, ...fromMethod }`.
- `title` — приоритет: `fromMethod.title` > `metaConfig.title` > `'Страница'`.

`MetaTag = { name: string; content: string; attribute?: 'name' | 'property' }` — для OG/Twitter указывайте `attribute: 'property'`.

**Серверный handler `readMethod`:**

```ts
// server/blogs/Blogs.meta.ts
import { defineObject } from '@tusten/core/server'
import * as v from 'valibot'

export default defineObject({
    name: 'Blogs',
    description: 'Блог',
    methods: {
        ReadMetaInfo: {
            description: 'Возвращает meta для поста',
            params: v.string(), // url
            handler: async (url) => {
                const slug = new URL(url).pathname.split('/').pop() ?? 'unknown'
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
```

**Клиентский `usePageMeta` (client-only, для динамики внутри компонента):**

```tsx
import { usePageMeta } from '@tusten/core/client'

export function View() {
    usePageMeta({
        title: 'Custom title',
        meta: [{ name: 'description', content: '...' }],
        microdata: { '@type': 'Article' },
    })
    return <div>...</div>
}
```

SSR — no-op (meta из `metaConfig` уже в `<head>`).

### Prefetch фабрик

```ts
// client/HomePage/Factories/Root.ts
import type { FactoryMap, TustenRouter } from '@tusten/core'

export default function getConfig(configParams: Record<string, unknown>, router: TustenRouter): FactoryMap {
    return {
        UserList: {
            dataFactoryName: 'HomePage/Factories/usersList:UserListLoader',
            dataFactoryArguments: { limit: 10 },
            dependencies: [],
        },
    }
}
```

### Слайс + изоморфный `loadData`

```ts
// client/HomePage/Factories/usersList.ts
import { Slice, Service, type FactoryImplementation } from '@tusten/core'

interface User {
    id: number
    name: string
}
interface UserListState {
    users: User[]
    total: number
    reload: () => void
}

const usersService = new Service({
    endpoint: 'Users',
    binding: { query: 'List' },
    cache: 30_000, // TTL
    cacheMaxEntries: 500, // LRU limit (default 500)
})

export class UserListSlice extends Slice<UserListState> {
    protected override _initState(result: unknown): UserListState {
        const { users } = result as { users: User[] }
        return {
            users,
            total: users.length,
            reload: () => {
                /* создаётся заново и на сервере, и на клиенте */
            },
        }
    }
}

export const UserListLoader: FactoryImplementation<UserListState> = {
    async loadData(args) {
        const limit = (args.limit as number) ?? 10
        const users = await usersService.query<{ limit: number }, User[]>({ limit })
        return { users }
    },
    slice: UserListSlice,
}
```

### Компонент

```tsx
// client/HomePage/view.tsx
import { useSlice, usePathname, Link } from '@tusten/core/client'
import type { UserListSlice } from './Factories/usersList'

export function View() {
    const slice = useSlice<UserListSlice>('UserList')
    const state = slice?.getState()
    const path = usePathname()

    if (!state) return <div>Loading…</div>

    return (
        <div>
            <h1>HomePage ({path})</h1>
            <p>Users: {state.total}</p>
            <Link href="/about" prefetch>
                → About (SPA, prefetch on hover)
            </Link>
        </div>
    )
}
```

### JSON-RPC-объект

```ts
// server/users/Users.meta.ts
import { defineObject } from '@tusten/core/server'
import type { RpcContext } from '@tusten/core/server'
import * as v from 'valibot'

export default defineObject({
    name: 'Users',
    description: 'Пользователи',
    methods: {
        List: {
            description: 'Список',
            params: v.object({ limit: v.optional(v.number()) }),
            handler: async (params, ctx) => {
                return ctx.db.users.findMany({ take: params.limit })
            },
        },
        Update: {
            auth: true,
            handler: async (params, ctx) => {
                const updated = await ctx.db.users.update(params)
                // ctx.stomp.message(...) — в разработке
                return updated
            },
        },
    },
})
```

### Конфиг

```ts
// tusten.config.ts
import { defineConfig } from '@tusten/core'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    ssr: true,
    layouts: {
        main: './layouts/Main.tsx',
        admin: './layouts/Admin.tsx',
    },
    components: {
        error: 'shared/ErrorBoundary:ErrorBoundary',
        loading: 'shared/Loading:Loading',
        notFound: 'shared/NotFound:NotFound',
    },
    server: {
        routes: 'server/api/routes.ts',
        plugins: 'server/plugins',
    },
    rpc: { enabled: true, url: '/service' },
    css: { main: 'styles/main.css' },
    vite: { plugins: [tailwindcss()] },
})
```

---

## 🏗 Архитектура

```
┌─────────────────────── Браузер ───────────────────────┐
│                                                        │
│  client/*/router.ts ──► defineRoute([...])             │
│  client/*/Factories ──► getConfig → Service            │
│  client/*/view.tsx ───► useSlice / useRouter / <Link>  │
│                         usePageMeta                    │
│                                                        │
└─────────────────┬──────────────────────────────────────┘
                  │ HTTP / WebSocket
                  ▼
┌────────────────── Fastify ────────────────────────────┐
│                                                        │
│  POST /service        ← JSON-RPC 2.0 (defineObject)    │
│  GET  /stomp          ← WebSocket (в планах)          │
│  GET  /api/*          ← defineServerRoutes            │
│  GET  /*              ← SSR / SPA HTML + meta         │
│                                                        │
│  ── при SSR: Service.call идёт через ALS executor ──   │
│     (прямой вызов handler'а из реестра, без HTTP)      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Ключевые архитектурные решения:**

- **`loadData` изоморфный** — работает на сервере и клиенте, только `fetch('/api/...')` или `Service.call(...)`. Никаких прямых обращений к БД, никаких Server Actions.
- **JSON-RPC для чтения и мутаций** — единый протокол, типизация через Standard Schema, `ctx.call` для композиции методов.
- **`metaConfig` + `resolveMeta`** — meta резолвится **параллельно** с prefetch (`Promise.all`), поэтому SSR latency = max(prefetch, meta), не сумма.
- **`ctx.stomp.message(key, payload)`** — real-time push (в разработке).
- **Три реестра middleware** — не смешиваются, каждый со своим контекстом.
- **`@tusten/core` / `@tusten/core/server` / `@tusten/core/client`** — client-safe разделение, `@tusten/core` не тянет Node.
- **269 unit-тестов** (Vitest) — ядро покрыто на 90%+.

---

## 📂 Структура репозитория

```
tusten-framework/
├── packages/
│   └── tusten/                  # пакет @tusten/core
│       ├── src/
│       │   ├── index.ts         # @tusten/core (client-safe)
│       │   ├── server.ts        # @tusten/core/server (Node-only)
│       │   ├── client/          # @tusten/core/client (React)
│       │   ├── shared/          # prefetch + meta-resolver (изоморфный)
│       │   ├── server/          # Fastify, SSR, RPC, STOMP (wip)
│       │   ├── build/           # build pipeline
│       │   └── vite/            # Vite-плагин (virtual modules)
│       └── README.md            # полная документация
│
├── examples/
│   └── basic/                   # демо на Tailwind v4
│       ├── client/              # Home / About / Blog / Admin
│       ├── server/              # API + JSON-RPC meta
│       └── tusten.config.ts
│
└── docs/                        # (скоро)
```

**Документация фреймворка** — [`packages/tusten/README.md`](packages/tusten/README.md). Там всё: API, схемы, подводные камни, roadmap.

---

## 🗺 Roadmap

### ✅ Готово

- **Phase 1** — SSR, SPA, prod build, CSS (Tailwind / per-component), enriched `_initState`
- **Phase 2** — `defineServerRoutes`, `defineServerPlugins`, 3 реестра middleware, `useRouter` / `<Link>`, JSON-RPC 2.0 (`/service`), `Service` с ALS executor
- **Phase 3** — динамические сегменты (`slug` / `path`), вложенные layouts по `parentId`, per-route `ssr: false`, error boundaries / loading / notFound
- **Phase 4** — `System.Describe`, рекурсивный CSS-scan, `devalue` (`Map` / `Date` / cyclic), cross-page кэш в `Service` (LRU, `cacheMaxEntries`)
- **Phase 5** — 269 unit-тестов (Vitest), GitHub Actions CI (`format:check` + `lint` + `typecheck` + `test`), Prettier + ESLint, публикация `@tusten/core@0.2.0-beta.4` в npm
- **Phase 6** — SEO / meta: `metaConfig` (статика), `readMethod` (JSON-RPC), `getMetaCallback` (функция), `usePageMeta` (client), `microdata` (JSON-LD), `resolveMeta` (SSR, параллельно с prefetch)

### 🚧 В разработке

- **STOMP-слой** — `ctx.stomp.message(key, payload)` + `useStomp(key, fn)` + автопереподключение (дизайн готов)

### 📋 Запланировано

- `create-tusten-app` — CLI-скаффолдер (`pnpm dlx create-tusten-app my-app`)
- Пресеты (`defineConfig({ preset: 'tailwind' })`)
- Сайт документации (сам tusten на tusten)
- Тесты для `ssr-handler.ts`, `create-server.ts`, `vite/plugin.ts` (Vite mock + `inject`)
- Redis-adapter для STOMP (PM2 / cluster)
- Auto-invalidate при мутациях (`create`/`update`/`destroy` → сброс `List`)
- `@fastify/rate-limit` на `/service` + CSRF-защита
- Мемоизация `useParams` / `useQuery`
- `<Link prefetch>` — `onTouchStart` для мобильных
- `<link rel="canonical">` и `alternates` в `metaConfig`
- Множественные `<meta>` с одинаковым `name` (Open Graph galleries)

### ❌ Не планируется

- **React Server Components** — осознанно. Другая архитектура, месяцы работы, ломает `Slice` / `loadData` / `defineObject`.
- **Server Actions** — осознанно. JSON-RPC + `Service.call` покрывает мутации.

---

## 🛠 Разработка

```bash
# Установка
pnpm install

# Проверки
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test

# Dev-сервер демо
pnpm dev:basic
TUSTEN_DEBUG=1 pnpm dev:basic      # + логи __ROOT_STATE_STR__

# Prod
pnpm build:basic
pnpm start:basic

# Дамп маршрутов и RPC-методов
pnpm inspect:basic

# Публикация
pnpm publish:alpha
pnpm publish:beta
pnpm publish:latest
```

### Требования

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (через `corepack enable`)

### Стиль кода

- Весь код документирован JSDoc (`@param`, `@returns`, `@throws`).
- Framework `.tsx` — через `createElement`, не JSX (иначе jiti ломает classic runtime).
- User `.tsx` — обычный JSX через Vite.
- Не-тривиальная логика — inline-комментарии (почему, а не что).

### Подводные камни (для контрибьюторов)

Перед правкой `vite/plugin.ts` или `server/ssr-handler.ts` прочитайте раздел «Подводные камни» в [`packages/tusten/README.md`](packages/tusten/README.md). Особенно:

- `RootProvider` / `SliceRegistry` / `devalueParse` — **только** через `vite.ssrLoadModule` (dev) / `dist/server/entry.js` (prod).
- `@tusten/core` не должен тянуть Node-зависимости.
- После правок `plugin.ts` / `serialize.ts` — **всегда** `rm -rf examples/basic/node_modules/.vite`.
- Всё, что `create-server.ts` передаёт в Vite-плагин, должен передавать и `build-client.ts` / `build-server.ts` (иначе dev ≠ prod).
- Windows: `import(absolutePath)` требует `pathToFileURL()` — иначе `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
- Тесты: мутации слайса (`slice.setState`, `registry.setPage`) после `render()` — только в `act()`.
- `resolveMeta` резолвится **параллельно** с `runPagePrefetch` (`Promise.all`) — не переделывать в sequential, это удвоит SSR latency.
- `getMetaCallback`-пути должны быть добавлены в `specToPath`/`allSsrSpecs` в Vite-плагине, иначе `resolveModule` их не найдёт.

---

## ❓ Зачем ещё один фреймворк

Потому что:

1. **Next.js тянет RSC и Server Actions** — мощно, но сложно. Если они не нужны, платите за них bundle size, когнитивной нагрузкой и временем сборки.
2. **Nuxt — Vue.** Отличный, но если вы на React — не подходит.
3. **Astro — контент-фреймворк.** Для дашбордов и админок неудобен.
4. **React Router 7 / Remix** — ментальная модель другая (loader'ы в route-модулях, actions, form-first). Не всем подходит.

**tusten** — для тех, кому нужен:

- **React 19 + Fastify + Vite** — три понятных инструмента, без магии.
- **JSON-RPC вместо REST** — типизированный, валидируемый, batch-friendly.
- **Изоморфный `loadData`** — один код на сервере и клиенте, только `fetch('/api/...')`.
- **`Slice` вместо Redux/Zustand** — встроенный, per-route, auto-dispose.
- **Client-safe разделение** — `@tusten/core` (pure), `@tusten/core/server` (Node), `@tusten/core/client` (React). Явно, без сюрпризов.
- **Контроль** — не «чёрный ящик», а ~8 000 строк читаемого TypeScript (ядро + тесты).

Если узнали себя — попробуйте демо.

---

## 🧪 Стабильность API

Фреймворк в статусе **beta**. Это значит:

### Что может измениться без предупреждения

- **Публичный API** — сигнатуры `defineRoute`, `defineGlobalLoader`, `defineObject`, `Service`, `Slice`, хуков (`useSlice`, `useRouter`, `usePageMeta`, `useStomp`, ...).
- **Формат конфига** (`tusten.config.ts`) — поля могут переименовываться, получать новые опции, менять дефолты.
- **Схема маршрута** (`TustenRoute`) — `path`, `slug`, `ssr`, `middleware`, `metaConfig`, `contentConfig` и т.д.
- **JSON-RPC** — wire-протокол, формат `System.Describe`, коды ошибок.
- **Meta**: `MetaTag`, `MetaResult`, `MetaConfig`, `PageMeta` — форма может расширяться.
- **Внутренние детали**, которые просачиваются наружу: `__ROOT_STATE_STR__`, `__ROOT_MIDDLEWARE__`, `virtual:tusten/*`, `dist/server/entry.js`.
- **Поведение** — например, дефолтный `cacheMaxEntries` в `Service` может измениться.

### Что стабилизируется раньше

- **`defineConfig`** — базовая структура (`ssr`, `clientDir`, `serverDir`, `layouts`, `css`) вряд ли изменится.
- **`defineRoute`** — структура маршрута (id, parentId, type, metaConfig) — фундаментальная.
- **`Slice` / `AbstractSlice`** — `hydrate`, `getState`, `setState`, `subscribe` — ядро реактивности.
- **`loadData(args, deps, ctx)`** — сигнатура.
- **`MetaTag`** — `{ name, content, attribute? }`.

### Философия версионирования

- **`0.x.y` (alpha / beta)** — API стабилизируется, breaking changes возможны в минорных версиях, но редко.
- **`0.x.0`** — обязательно breaking changes (например, `0.2.0` → `0.3.0`).
- **`0.x.y` (patch)** — багфиксы, без breaking.
- **`1.0.0`** — первый стабильный релиз. После — semver: breaking changes только в мажорных версиях.

### Как отслеживать

- **GitHub Releases** — каждое изменение, помеченное `BREAKING` или `feat`.
- **`CHANGELOG.md`** (скоро) — полная история.
- **`packages/tusten/README.md`** — актуальная документация.

### Если вы уже используете tusten

- **Читайте Release Notes** перед `pnpm update @tusten/core`.
- **Фиксируйте точную версию** в проде — `pnpm add @tusten/core@0.2.0-beta.4` (не `@beta`).
- **Пишите обёртки** над публичным API — если сигнатура изменится, поправите в одном месте.
- **Сообщайте о проблемах** — [Issues](https://github.com/yartema/tusten-framework/issues) помогают стабилизировать API раньше.

---

## 📄 Лицензия

[MIT](LICENSE) © 2026 yartema

---

## 🙏 Благодарности

- [React](https://react.dev) — UI, `renderToPipeableStream`, `hydrateRoot`
- [Fastify](https://fastify.dev) — HTTP-сервер
- [Vite](https://vitejs.dev) — сборщик и dev-сервер
- [devalue](https://github.com/Rich-Harris/devalue) — сериализация богатых типов
- [jiti](https://github.com/unjs/jiti) — загрузка `.ts` без сборки
- [Valibot](https://valibot.dev) — Standard Schema валидация (в демо)
