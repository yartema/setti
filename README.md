# SETTI

> **Fullstack React framework** on **React 19** + **Fastify 5** + **Vite**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000.svg)](https://fastify.dev)
[![Vite](https://img.shields.io/badge/Vite-6%20%7C%208-646CFF.svg)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org)

**setti** — мета-фреймворк уровня Nuxt/Next, который собирается из трёх проверенных инструментов: React, Fastify, Vite. Устанавливается как зависимость, сканирует `client/`, строит карту маршрутов, поднимает сервер с SSR/SPA и JSON-RPC 2.0 — без магии, без RSC, без Server Actions.

> ⚠️ **Pre-alpha (`0.1.0-alpha`).**
>
> ⚠️ **Pre-alpha (`0.1.0-alpha`).**
>
> - Установка: `pnpm add setti@alpha`
> - **API может измениться** до `1.0.0`.
> - **Не используйте в production.**
> - **API и функционал могут измениться** без предупреждения в любой момент до стабильного `1.0.0`.
> - Обратная совместимость **не гарантируется** между alpha-версиями (`0.1.0-alpha.0` → `0.1.0-alpha.1`).
> - Следите за [Releases](https://github.com/yartema/setti/releases) — там breaking changes помечаются явно.

---

## ✨ Что внутри

- **SSR из коробки** — `renderToPipeableStream` + `hydrateRoot`, стриминг, единый `SettiContext` между сервером и клиентом.
- **SPA по требованию** — глобально (`ssr: false`), per-route (`route.ssr: false`) или через `?noSSR=true` для отладки.
- **Файловый роутинг** — `client/*/router.ts` → `defineRoute([...])`. Динамические сегменты через `slug: ['/regex:[a-z0-9-]+']` или `path: '/blog/:slug'`.
- **Вложенные layouts** — по `parentId`, рендер цепочкой `root → admin → page`. `<Outlet/>` или `props.children` на выбор.
- **JSON-RPC 2.0 из коробки** — `defineObject` в `server/**/*.meta.ts`, endpoint `/service`, batch, валидация через Standard Schema (valibot / zod / arktype), auth, `ctx.call`, `System.Describe`.
- **Три реестра middleware** — client-page, server-page, server-api. Не смешиваются, наследуются по `parentId`.
- **Слайсы** — собственный реактивный store (`Slice` / `AbstractSlice` / `SliceRegistry`). Page-scoped и global, авто `disposePage()` при навигации, `useSlice` / `useStrictSlice` / `useSliceRef`.
- **Cross-page кэш на уровне `SettiService`** — TTL, `invalidate()`, `<Link prefetch>` заполняет кэш по hover. Не на уровне страниц — на уровне вызовов.
- **`devalue` для сериализации** — `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, циклы переживают SSR и восстанавливаются на клиенте.
- **Client-safe разделение** — три точки входа: `setti` (pure TS), `setti/server` (Node-only), `setti/client` (React). `setti` не тянет jiti/fastify/vite.
- **Error boundaries / Loading / Not Found** — через `config.components`, с дефолтами.
- **Prod build** — `setti build` → `dist/client` + `dist/server`. `setti start` — Fastify + статика.

---

## 🚀 Быстрый старт

Пока пакет не в npm — клонируйте монорепо и запустите демо:

```bash
git clone https://github.com/your-username/setti.git
cd setti
pnpm install
pnpm dev:basic
```

Откройте **http://localhost:3000** — демо на Tailwind v4 с 4 страницами (Home / About / Blog / Admin), API, JSON-RPC и вложенными layouts.

**Другие команды:**

```bash
pnpm lint                         # ESLint
pnpm typecheck                    # tsc --noEmit
pnpm inspect:basic                # dump маршрутов и RPC-методов
pnpm --filter examples-basic exec setti build    # prod-сборка
pnpm --filter examples-basic exec setti start    # prod-сервер
```

---

## 🧑‍💻 Как это выглядит

### Маршрут

```ts
// client/HomePage/router.ts
import { defineRoute } from 'setti'

export default defineRoute([
    {
        id: 'home',
        index: true, // URL: /
        title: 'Главная',
        type: 'main', // layout из config.layouts
        middleware: [{ id: 'auth', handler: 'client/middleware/auth' }],
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

### Prefetch фабрик

```ts
// client/HomePage/Factories/Root.ts
import type { FactoryMap, SettiRouter } from 'setti'

export default function getConfig(configParams: Record<string, unknown>, router: SettiRouter): FactoryMap {
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
import { Slice, SettiService, type FactoryImplementation } from 'setti'

interface User {
    id: number
    name: string
}
interface UserListState {
    users: User[]
    total: number
    reload: () => void
}

const usersService = new SettiService({
    endpoint: 'Users',
    binding: { query: 'List' },
    cache: 30_000, // cross-page кэш на 30 сек
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
import { useSlice, usePathname, Link } from 'setti/client'
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
import { defineObject } from 'setti/server'
import type { RpcContext } from 'setti/server'
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
                ctx.stomp.message('users.updated', { id: updated.id })
                return updated
            },
        },
    },
})
```

### Конфиг

```ts
// setti.config.ts
import { defineSettiConfig } from 'setti'
import tailwindcss from '@tailwindcss/vite'

export default defineSettiConfig({
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
│  client/*/Factories ──► getConfig → SettiService        │
│  client/*/view.tsx ───► useSlice / useRouter / <Link>  │
│                                                        │
└─────────────────┬──────────────────────────────────────┘
                  │ HTTP / WebSocket
                  ▼
┌────────────────── Fastify ────────────────────────────┐
│                                                        │
│  POST /service        ← JSON-RPC 2.0 (defineObject)    │
│  GET  /stomp          ← WebSocket (в планах)          │
│  GET  /api/*          ← defineServerRoutes            │
│  GET  /*              ← SSR / SPA HTML                │
│                                                        │
│  ── при SSR: Service.call идёт через ALS executor ──   │
│     (прямой вызов handler'а из реестра, без HTTP)      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Ключевые архитектурные решения:**

- **`loadData` изоморфный** — работает на сервере и клиенте, только `fetch('/api/...')` или `SettiService.call(...)`. Никаких прямых обращений к БД, никаких Server Actions.
- **JSON-RPC для чтения и мутаций** — единый протокол, типизация через Standard Schema, `ctx.call` для композиции методов.
- **`ctx.stomp.message(key, payload)`** — real-time push (в разработке).
- **Три реестра middleware** — не смешиваются, каждый со своим контекстом.
- **`setti` / `setti/server` / `setti/client`** — client-safe разделение, `setti` не тянет Node.

---

## 📂 Структура репозитория

```
setti/
├── packages/
│   └── setti/                  # сам фреймворк
│       ├── src/
│       │   ├── index.ts       # setti (client-safe)
│       │   ├── server.ts      # setti/server (Node-only)
│       │   ├── client/        # setti/client (React)
│       │   ├── shared/        # prefetch (изоморфный)
│       │   ├── server/        # Fastify, SSR, RPC, STOMP (wip)
│       │   ├── build/         # build pipeline
│       │   └── vite/          # Vite-плагин (virtual modules)
│       └── README.md          # полная документация
│
├── examples/
│   └── basic/                 # демо на Tailwind v4
│       ├── client/            # Home / About / Blog / Admin
│       ├── server/            # API + JSON-RPC meta
│       └── setti.config.ts
│
└── docs/                      # (скоро)
```

**Документация фреймворка** — [`packages/setti/README.md`](packages/setti/README.md). Там всё: API, схемы, подводные камни, roadmap.

---

## 🗺 Roadmap

### ✅ Готово (Phase 1–4)

- **Phase 1** — SSR, SPA, prod build, CSS (Tailwind / per-component), enriched `_initState`
- **Phase 2** — `defineServerRoutes`, `defineServerPlugins`, 3 реестра middleware, `useRouter` / `<Link>`, JSON-RPC 2.0 (`/service`), `SettiService` с ALS executor
- **Phase 3** — динамические сегменты (`slug` / `path`), вложенные layouts по `parentId`, per-route `ssr: false`, error boundaries / loading / notFound
- **Phase 4** — `System.Describe`, рекурсивный CSS-scan, `devalue` (`Map` / `Date` / cyclic), cross-page кэш в `SettiService`

### 🚧 В разработке

- **STOMP-слой** — `ctx.stomp.message(key, payload)` + `useStomp(key, fn)` + автопереподключение (дизайн готов, см. `docs/stomp.md` — скоро)
- **Публикация в npm** — `tsup` + `dist/` + peerDependencies

### 📋 Запланировано

- `create-setti-app` — CLI-скаффолдер (`pnpm dlx create-setti-app my-app`)
- Пресеты (`defineSettiConfig({ preset: 'tailwind' })`)
- Сайт документации (сам setti на setti)
- Юнит-тесты (`compileRoute`, `matchRoute`, `RpcRegistry`, сканер)
- Redis-adapter для STOMP (PM2 / cluster)
- Auto-invalidate при мутациях (`create`/`update`/`destroy` → сброс `List`)

### ❌ Не планируется

- **React Server Components** — осознанно. Другая архитектура, месяцы работы, ломает `Slice` / `loadData` / `defineObject`.
- **Server Actions** — осознанно. JSON-RPC + `SettiService.call` покрывает мутации.

---

## 🛠 Разработка

```bash
# Установка
pnpm install

# Проверки
pnpm lint
pnpm typecheck

# Dev-сервер демо
pnpm dev:basic
SETTI_DEBUG=1 pnpm dev:basic      # + логи __SETTI_STATE_STR__

# Prod
pnpm --filter examples-basic exec setti build
pnpm --filter examples-basic exec setti start

# Дамп маршрутов и RPC-методов
pnpm inspect:basic
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

Перед правкой `vite/plugin.ts` или `server/ssr-handler.ts` прочитайте раздел «Подводные камни» в [`packages/setti/README.md`](packages/setti/README.md). Особенно:

- `SettiProvider` / `SliceRegistry` / `devalueParse` — **только** через `vite.ssrLoadModule` (dev) / `dist/server/entry.js` (prod).
- `setti` не должен тянуть Node-зависимости.
- После правок `plugin.ts` / `serialize.ts` — **всегда** `rm -rf examples/basic/node_modules/.vite`.
- Всё, что `create-server.ts` передаёт в `settiPlugin`, должен передавать и `build-client.ts` / `build-server.ts` (иначе dev ≠ prod).

---

## ❓ Зачем ещё один фреймворк

Потому что:

1. **Next.js тянет RSC и Server Actions** — мощно, но сложно. Если они не нужны, платите за них bundle size, когнитивной нагрузкой и временем сборки.
2. **Nuxt — Vue.** Отличный, но если вы на React — не подходит.
3. **Astro — контент-фреймворк.** Для дашбордов и админок неудобен.
4. **React Router 7 / Remix** — ментальная модель другая (loader'ы в route-модулях, actions, form-first). Не всем подходит.

**setti** — для тех, кому нужен:

- **React 19 + Fastify + Vite** — три понятных инструмента, без магии.
- **JSON-RPC вместо REST** — типизированный, валидируемый, batch-friendly.
- **Изоморфный `loadData`** — один код на сервере и клиенте, только `fetch('/api/...')`.
- **`Slice` вместо Redux/Zustand** — встроенный, per-route, auto-dispose.
- **Client-safe разделение** — `setti` (pure), `setti/server` (Node), `setti/client` (React). Явно, без сюрпризов.
- **Контроль** — не «чёрный ящик», а 4 000 строк читаемого TypeScript.

Если узнали себя — попробуйте демо.

---

## 🧪 Стабильность API

Фреймворк в статусе **pre-alpha**. Это значит:

### Что может измениться без предупреждения

- **Публичный API** — сигнатуры `defineRoute`, `defineGlobalLoader`, `defineObject`, `SettiService`, `Slice`, хуков (`useSlice`, `useRouter`, `useStomp`, ...).
- **Формат конфига** (`setti.config.ts`) — поля могут переименовываться, получать новые опции, менять дефолты.
- **Схема маршрута** (`SettiRoute`) — `path`, `slug`, `ssr`, `middleware`, `contentConfig` и т.д.
- **JSON-RPC** — wire-протокол, формат `System.Describe`, коды ошибок.
- **Внутренние детали**, которые просачиваются наружу: `__SETTI_STATE_STR__`, `__SETTI_MIDDLEWARE__`, `virtual:setti/*` modules, `dist/server/entry.js`.
- **Поведение** — например, дефолтный `cache` в `SettiService` может стать `30_000` вместо `0`, `index: true` может потребовать `ssr: true` явно и т.д.

### Что стабилизируется раньше

- **`defineSettiConfig`** — базовая структура (`ssr`, `clientDir`, `serverDir`, `layouts`, `css`) вряд ли изменится.
- **`defineRoute`** — структура маршрута (id, parentId, title, type) — фундаментальная.
- **`Slice` / `AbstractSlice`** — `hydrate`, `getState`, `setState`, `subscribe` — ядро реактивности.
- **`loadData(args, deps, ctx)`** — сигнатура.

### Философия версионирования

- **`0.x.y` (pre-alpha / alpha)** — API нестабилен, breaking changes возможны в любой минорной версии.
- **`0.x.0`** — обязательно breaking changes (например, `0.1.0` → `0.2.0`).
- **`0.x.y` (patch)** — багфиксы, без breaking (постараемся).
- **`1.0.0`** — первый стабильный релиз. После него — semver: breaking changes только в мажорных версиях.

### Как отслеживать

- **GitHub Releases** — каждое изменение, помеченное `BREAKING` или `feat`.
- **`CHANGELOG.md`** (скоро) — полная история.
- **`packages/setti/README.md`** — актуальная документация, обновляется вместе с кодом.

### Если вы уже используете setti

- **Фиксируйте точную версию** — `pnpm add setti@0.1.0-alpha.3` (не `@alpha`).
- **Читайте Release Notes** перед `pnpm update setti`.
- **Пишите обёртки** над публичным API — если сигнатура изменится, поправите в одном месте.
- **Сообщайте о проблемах** — [Issues](https://github.com/your-username/setti/issues) помогают стабилизировать API раньше.

---

## 📄 Лицензия

[MIT](LICENSE) © 2026 yar.tema

---

## 🙏 Благодарности

- [React](https://react.dev) — UI, `renderToPipeableStream`, `hydrateRoot`
- [Fastify](https://fastify.dev) — HTTP-сервер
- [Vite](https://vitejs.dev) — сборщик и dev-сервер
- [devalue](https://github.com/Rich-Harris/devalue) — сериализация богатых типов
- [jiti](https://github.com/unjs/jiti) — загрузка `.ts` без сборки
- [Valibot](https://valibot.dev) — Standard Schema валидация (в демо)
