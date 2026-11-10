# STOMP-слой nixo — план реализации

> Документ фиксирует дизайн real-time сообщений (STOMP-подобный слой).
> Реализация — после подтверждения открытых вопросов в конце.

---

## 🎯 Что делаем

Сервер может отправить сообщение по ключу (`users.updated`, `chat.message`, ...). Клиенты, подписанные на этот ключ, получают payload и вызывают свою функцию-обработчик.

**Сценарии:**
- Уведомления («новый заказ», «сообщение в чате»).
- Live-обновления данных (`users.updated` → обновить список).
- Сигналы (`online-count`, `system.alert`).

**Ключевое отличие от JSON-RPC:**
- JSON-RPC — клиент → сервер → клиент (request/response).
- STOMP — сервер → клиенты (push), инициатива с сервера, не по запросу клиента.

---

## 🔑 Ключевые решения

| # | Область | Решение |
|---|---|---|
| 1 | Транспорт | **WebSocket** (native на клиенте, `@fastify/websocket` на сервере) |
| 2 | Endpoint | **`/stomp`** |
| 3 | Wire protocol | **Упрощённый JSON** (не настоящий STOMP 1.2 — см. открытые вопросы) |
| 4 | Подписки на сервере | **MVP: без подписок.** Сервер broadcast'ит всем сокетам, клиент фильтрует по key |
| 5 | Подписки на клиенте | `Map<key, Set<handler>>` — module singleton `nixoStomp` |
| 6 | API сервера | `ctx.stomp.message(key, payload)` в `RpcContext` (только в RPC handler) |
| 7 | API клиента | `useStomp(key, fn)` + `nixoStomp.subscribe(key, fn)` |
| 8 | Auth | Cookies на WS upgrade → `conn.user` (из `config.rpc.extendContext`) |
| 9 | Persistence | **Нет.** Только те, кто сейчас подключён |
| 10 | Reconnect | Auto с exponential backoff (1s, 2s, 4s, 8s, 16s, max 5), resubscribe на клиенте |
| 11 | Доставка | **At-most-once.** Без ack/nack. Потеря при disconnect — нормально |
| 12 | Хранение на сервере | `Set<WebSocket>` в per-process singleton. С PM2/cluster — каждый worker свой (Redis adapter — Phase 2) |

---

## 🏗 Архитектура

```
┌──────────────┐         WebSocket          ┌──────────────────┐
│  Браузер A   │◄──────── /stomp ────────► │                  │
│              │                            │   StompServer    │
│  nixoStomp   │     { type: 'message',     │   (singleton)    │
│  .subscribe  │       key, payload }       │                  │
│  ('users.     │◄─────────────────────────  │  Set<WebSocket>  │
│   updated')  │                            │                  │
└──────────────┘                            │                  │
                                            │                  │
┌──────────────┐         WebSocket          │                  │
│  Браузер B   │◄──────── /stomp ────────► │                  │
│  (не подписан│                            │  message(key,    │
│   на key)    │◄── { message, key, ... } ──│   payload)       │
│              │     (игнорирует — нет      │       ▲          │
│              │      handler'а для key)    │       │          │
└──────────────┘                            └───────┼──────────┘
                                                    │
                                     ctx.stomp.message(key, payload)
                                                    │
                                            ┌───────┴──────────┐
                                            │  RPC handler     │
                                            │  (Users.Update)  │
                                            └──────────────────┘
```

**Поток:**
1. Клиент при первом `useStomp('users.updated', fn)`:
   - Регистрирует `fn` в `Map<key, Set<handler>>`.
   - Если WS ещё нет — открывает `ws://localhost:3000/stomp`.
2. Пользователь вызывает мутацию (`Users.Update` через `NixoService.call`).
3. В handler'е `Users.Update`: `ctx.stomp.message('users.updated', { id })`.
4. `StompServer.message(key, payload)` → `{ type: 'message', key, payload }` **всем** открытым сокетам.
5. Клиент A: `handlers.get('users.updated')` → вызывает `fn(payload)`.
6. Клиент B: `handlers.get('users.updated')` → пусто → игнорирует.
7. При размонтировании компонента (или `unsubscribe()`) — удаление handler'а. Если handler'ов для key не осталось — `{ type: 'unsubscribe', key }` **не отправляется** (MVP без подписок на сервере).

---

## 📡 Wire protocol (упрощённый JSON)

**Client → Server:**

```json
{ "type": "ping" }
```

Больше ничего (MVP без `subscribe`/`unsubscribe`).

**Server → Client:**

```json
{ "type": "message", "key": "users.updated", "payload": { "id": 42 } }
{ "type": "pong" }
{ "type": "error", "message": "..." }
```

**Почему не настоящий STOMP 1.2:** нужен для интеропа с Spring Boot / RabbitMQ Web-STOMP. Парсинг `\0`-framer'ов, `CONNECT`/`SUBSCRIBE`/`MESSAGE`, `ack`/`nack` — сотни строк. Если нужен — Phase 2, API прикладника (`ctx.stomp.message` / `useStomp`) **не меняется**.

---

## 🔧 Сервер

### `StompServer` (класс, singleton в процессе)

**Файл:** `packages/nixo/src/server/stomp/StompServer.ts`

**Публичный API:**

```ts
class StompServer {
  /** Добавить соединение (вызывается из /stomp endpoint). */
  addConnection(conn: StompConnection): void

  /** Удалить соединение (при disconnect). */
  removeConnection(conn: StompConnection): void

  /** Broadcast всем открытым сокетам. MVP без фильтрации. */
  message(key: string, payload: unknown): void

  /** Количество активных соединений (для дебага). */
  get size(): number
}
```

**Внутри:**
```ts
private connections = new Set<StompConnection>()
```

`StompConnection`:
```ts
interface StompConnection {
  id: string                       // UUID
  socket: WebSocket
  user: unknown | null             // из config.rpc.extendContext
  cookies: Record<string, string>
  headers: Record<string, string>
}
```

### `/stomp` endpoint

**Файл:** `packages/nixo/src/server/stomp/create-stomp-route.ts`

```ts
fastify.get(config.stomp.url, { websocket: true }, async (socket, req) => {
  const cookies = parseCookieHeader(req.headers.cookie)
  let user: unknown | null = null
  if (config.rpc.extendContext) {
    try {
      const ext = await config.rpc.extendContext({ headers: req.headers })
      user = ext.user ?? null
    } catch { /* ignore */ }
  }
  const conn: StompConnection = {
    id: randomUUID(),
    socket,
    user,
    cookies,
    headers: flattenHeaders(req.headers),
  }
  stompServer.addConnection(conn)

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
    } catch { /* ignore malformed */ }
  })

  socket.on('close', () => {
    stompServer.removeConnection(conn)
  })
})
```

### `RpcContext.stomp`

**В `packages/nixo/src/types.ts`:**

```ts
export interface RpcContext {
  requestId: string
  call: <R = unknown>(method: string, params?: unknown) => Promise<R>
  stomp: {
    message: <T = unknown>(key: string, payload: T) => void
  }
  [key: string]: unknown
}
```

**В `packages/nixo/src/server/rpc/process.ts` → `processOne`:**

```ts
ctx.stomp = {
  message: (key, payload) => stompServer?.message(key, payload),
}
```

`stompServer` передаётся в `processOne` / `processBody` через параметры (или `createRpcHandler`).

### Использование в handler'е

```ts
// server/users/Users.meta.ts
Update: {
  handler: async (params, ctx) => {
    const updated = await db.users.update(params)
    ctx.stomp.message('users.updated', { id: updated.id, name: updated.name })
    return updated
  },
},
```

---

## 💻 Клиент

### `StompClient` (module singleton `nixoStomp`)

**Файл:** `packages/nixo/src/client/stomp/StompClient.ts`

```ts
type StompHandler = (payload: unknown) => void

class StompClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<StompHandler>>()
  private connecting = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Подписаться на key. Возвращает unsubscribe.
   * Первый subscribe открывает WS (lazy).
   */
  subscribe(key: string, handler: StompHandler): () => void

  /** Ручное закрытие (для тестов). */
  disconnect(): void

  private ensureConnected(): void
  private onMessage(ev: MessageEvent): void
  private reconnect(): void
}
```

**Поведение:**
- **Lazy connect:** WS открывается при первом `subscribe`.
- **Не закрывается** при потере последнего handler'а (избегаем reconnect-thrash).
- **Auto reconnect:** при `close` (не по нашему `disconnect`) — exponential backoff до 5 попыток.
- **Heartbeat:** ping каждые 30 сек, если `config.stomp.heartbeat > 0`. При отсутствии pong за 2 интервала — close → reconnect.

**Экспорт:**
```ts
// packages/nixo/src/client/index.ts
export { nixoStomp } from './stomp/StompClient'
```

### Хук `useStomp`

**Файл:** `packages/nixo/src/client/stomp/useStomp.ts`

```tsx
export function useStomp(
  key: string,
  handler: (payload: unknown) => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const stable = (payload: unknown) => handlerRef.current(payload)
    return nixoStomp.subscribe(key, stable)
  }, [key])
}
```

- `handler` меняется между рендерами — `useRef` держит актуальный.
- `key` в deps — при смене переподписка.
- При размонтировании — auto-unsubscribe.

### Использование в компоненте

```tsx
import { useStomp } from 'nixo/client'

export function View() {
  const list = useSlice<UserListSlice>('UserList')

  useStomp('users.updated', (payload) => {
    console.log('user updated:', payload)
    list?.setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === (payload as { id: number }).id ? { ...u, ...payload } : u,
      ),
    }))
  })

  return ...
}
```

### Imperative

```ts
import { nixoStomp } from 'nixo/client'

const unsubscribe = nixoStomp.subscribe('users.updated', (payload) => {
  console.log(payload)
})

// позже
unsubscribe()
```

---

## ⚙️ Конфиг

```ts
// nixo.config.ts
export default defineNixoConfig({
  stomp: {
    enabled: true,            // по умолчанию true
    url: '/stomp',            // endpoint
    heartbeat: 30000,         // ping каждые 30 сек (0 — выключить)
    reconnect: {
      maxAttempts: 5,         // 1s, 2s, 4s, 8s, 16s
      baseDelay: 1000,
    },
  },
})
```

`stomp: false` — endpoint не регистрируется, `ctx.stomp.message` бросает `NixoError('STOMP disabled')`, `nixoStomp.subscribe` бросает `NixoError('STOMP disabled')`.

**Типы** (`types.ts`):

```ts
export interface StompOptions {
  enabled?: boolean
  url?: string
  heartbeat?: number
  reconnect?: {
    maxAttempts?: number
    baseDelay?: number
  }
}

export interface ResolvedStompOptions {
  enabled: boolean
  url: string
  heartbeat: number
  reconnect: {
    maxAttempts: number
    baseDelay: number
  }
}
```

---

## 📋 План реализации

### Шаг 1 — Типы и конфиг

- [ ] `StompOptions`, `ResolvedStompOptions` в `types.ts`.
- [ ] `RpcContext.stomp` в `types.ts`.
- [ ] `NixoConfig.stomp` + дефолты в `config.ts`.
- [ ] `defineNixoConfig` — валидация `stomp` (url начинается с `/`).

### Шаг 2 — Сервер

- [ ] `pnpm --filter nixo add @fastify/websocket`.
- [ ] `StompServer` класс (`server/stomp/StompServer.ts`).
- [ ] `/stomp` endpoint (`server/stomp/create-stomp-route.ts`).
- [ ] `addConnection` / `removeConnection` / `message` / `size`.
- [ ] Heartbeat (ping/pong) — опционально.
- [ ] Регистрация в `create-server.ts` (если `config.stomp.enabled`).
- [ ] `stompServer` → `createRpcHandler` → `processOne` → `ctx.stomp`.

### Шаг 3 — Клиент

- [ ] `StompClient` класс (`client/stomp/StompClient.ts`).
- [ ] `nixoStomp` singleton.
- [ ] `subscribe` / `unsubscribe` (local Map).
- [ ] Auto reconnect с backoff.
- [ ] Heartbeat (client → ping, ждёт pong).
- [ ] `useStomp` hook.
- [ ] Реэкспорт из `nixo/client`.

### Шаг 4 — Демо

- [ ] `Users.Update` в `server/users/Users.meta.ts` — `ctx.stomp.message('users.updated', { id })`.
- [ ] В `HomePage/view.tsx` — `useStomp('users.updated', ...)` → обновление `UserList` + toast/console.
- [ ] Кнопка «Update user» → `NixoService.call('Update', { id: 1 })` → broadcast → `useStomp` в компоненте → UI обновился.

### Шаг 5 — README

- [ ] Секция `#### 2.17. STOMP-слой` — API, конфиг, wire protocol.

**Оценка:** ~600 строк + демо. 1–2 итерации.

---

## ❌ Что НЕ входит в MVP

| Фича | Почему отложено |
|---|---|
| **Подписки на сервере** (`Map<key, Set<conn>>`) | MVP — broadcast всем, клиент фильтрует. Приватность — Phase 2 |
| **Auth-фильтрация на сервере** (`message(key, payload, { filter })`) | Требует серверных подписок. Phase 2 |
| **Приватность payload** | В MVP все данные видны в DevTools → WS. Phase 2 |
| **`ctx.stomp.to(connId).message(...)`** | Только broadcast. Phase 2 |
| **`ctx.stomp.toUser(userId).message(...)`** | Phase 2 |
| **Persistence / offline-очередь** | Только онлайн-клиенты. Phase 2 |
| **Redis adapter** (для PM2/cluster) | Per-process `Set`. Phase 2 |
| **Настоящий STOMP 1.2** | Упрощённый JSON. Phase 2 если нужен интероп |
| **Ack/nack, at-least-once** | At-most-once. Phase 2 |
| **Бинарные сообщения** | Только JSON. Phase 2 |
| **Server middleware на WS** | Auth только через cookies на upgrade. Phase 2 |
| **Типизация payload через реестр** | Generic `<T>` — достаточно |

---

## ❓ Открытые вопросы (для следующей сессии)

### S1. Wire protocol

- **A. Упрощённый JSON** (рекомендую): `{ type: 'message', key, payload }`.
- **B. Настоящий STOMP 1.2** с `CONNECT`/`SUBSCRIBE`/`MESSAGE` фреймами.
- **C. Гибрид** — `config.stomp.protocol: 'json' | 'stomp'`.

**Голос: A.** B — Phase 2 при необходимости.

### S2. `ctx.stomp.to(...)` в MVP

- **A.** Только `message(key, payload)` (broadcast).
- **B.** + `to(connectionId).message(...)`.
- **C.** + `toUser(userId).message(...)`.

**Голос: A.** B/C — Phase 2.

### S3. Типизация payload

- **A.** `unknown`.
- **B.** Generic `<T>`: `ctx.stomp.message<T>('users.updated', payload: T)`.
- **C.** Реестр типов `defineStompEvents({...})`.

**Голос: B.**

### S4. Как `StompServer` попадает в `RpcContext`

- **A.** Явно через `createRpcHandler({ registry, config, stompServer })` → `processOne` → `ctx.stomp`.
- **B.** Через ALS (`getRpcContext().stomp`).
- **C.** Через `globalThis.__nixoStomp`.

**Голос: A.** Тестируемо.

### S5. Client `StompClient` — один на приложение или per-provider

- **A.** Module singleton `nixoStomp`.
- **B.** Через `NixoProvider` (тестируемо, изолируемо).

**Голос: A** для MVP.

### S6. Подписки на сервере — MVP или сразу?

**Уже обсудили:** MVP — **без подписок** (broadcast всем, клиент фильтрует). Phase 2 — подписки + auth-фильтр.

**Голос: подтверждено (без подписок).**

---

## 🧭 С чего начать реализацию

1. Прочитать этот документ.
2. Ответить на **S1–S5** (или принять мои голоса).
3. Стартовать с **Шага 1** (типы + конфиг).
4. Идти по **Шагу 2 → 3 → 4 → 5**.

**API прикладника** не зависит от S1 (protocol) — можно менять реализацию, не ломая `ctx.stomp.message` и `useStomp`.

---

## 📄 Файлы, которые появятся

```
packages/nixo/src/
├── types.ts                                # StompOptions, RpcContext.stomp
├── config.ts                               # дефолты stomp
├── server/
│   ├── stomp/
│   │   ├── StompServer.ts                  # класс
│   │   └── create-stomp-route.ts           # /stomp endpoint
│   ├── create-server.ts                    # регистрация
│   ├── rpc-handler.ts                      # stompServer в options
│   └── rpc/process.ts                      # ctx.stomp
├── client/
│   ├── stomp/
│   │   ├── StompClient.ts                  # nixoStomp singleton
│   │   └── useStomp.ts                     # хук
│   └── index.ts                            # реэкспорт

examples/basic/
├── server/users/Users.meta.ts              # ctx.stomp.message
└── client/HomePage/view.tsx                # useStomp demo
```

**Зависимости:** `@fastify/websocket` (+ `ws` транзитивно).
