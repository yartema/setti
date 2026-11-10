import type { Slice } from './client/slices/Slice';
import type { FastifyServerOptions } from 'fastify'

/** HTTP-метод API-роута. */
export type HttpMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'

/**
 * Объявление middleware.
 *
 * Используется в `NixoRoute.middleware` (страницы), `ServerRoute.middleware`
 * (API) и глобально в `NixoConfig.middleware`.
 */
export interface MiddlewareDef {
    /** Уникальный ключ (отладка, порядок, логи). */
    id: string
    /** Путь до async-функции от `projectDir`. */
    handler: string
    /** Первый аргумент handler'а. */
    params?: Record<string, unknown>
    /** Только для глобальных в `nixo.config.ts`. */
    side?: 'client' | 'server' | 'both'
}

/** API-роут (Phase 2.1). */
export interface ServerRoute {
    /** HTTP-метод. */
    method: HttpMethod
    /** URL-путь (Fastify `url`). */
    path: string
    /** Путь до async-функции-handler'а. */
    handler: string
    /** Статические параметры (первый аргумент handler'а). */
    params?: Record<string, unknown>
    /** API-middleware-цепочка. */
    middleware?: MiddlewareDef[]
}

/** Fastify-плагин из `server/plugins/`. */
export interface ServerPluginDef {
    /** Имя (из имени файла). */
    name: string
    /** Абсолютный путь. */
    path: string
}

/** Опции `defineServerPlugins`. */
export interface ServerPluginsOptions {
    /** Явный порядок регистрации (по именам). Остальные — в конце, алфавитно. */
    order?: string[]
}

/**
 * Публичные типы nixo.
 *
 * Здесь собраны контракты конфигурации, маршрутов, фабрик, манифеста
 * и других сущностей, которые используются сканнером и runtime-ом.
 */

/**
 * Конфигурация фреймворка, задаваемая в `nixo.config.ts`
 * через `defineNixoConfig`.
 */
export interface NixoConfig {
    /** Включён ли SSR. Если `false` — приложение работает как SPA. */
    ssr?: boolean
    /** Каталог клиентского кода. По умолчанию `client`. */
    clientDir?: string
    /** Каталог серверного кода. По умолчанию `server`. */
    serverDir?: string
    /**
     * Реестр layout'ов. Ключ — идентификатор, используемый в `route.type`.
     * Значение — путь до компонента layout'а относительно `clientDir`.
     */
    layouts?: Record<string, string>
    /** Настройки HTTP-сервера (Fastify). */
    server?: {
        port?: number
        host?: string
        /** Путь до файла с `defineServerRoutes([...])`. */
        routes?: string
        /** Путь до каталога с Fastify-плагинами. */
        plugins?: string
    }
    /** Мерж в пользовательскую Vite-конфигурацию (для Phase 1b). */
    vite?: Record<string, unknown>
    /** Настройки сборки. */
    build?: {
        outDir?: string
    }
    /** Публичные и приватные переменные окружения (Phase 2). */
    runtimeConfig?: {
        public?: Record<string, unknown>
    },
    css?: {
        /**
         * Путь до основного CSS-файла относительно `clientDir`.
         * Обычно содержит Tailwind-директивы и глобальные стили.
         */
        main?: string
    },
    /** Глобальные middleware (client / server / both). */
    middleware?: MiddlewareDef[],
    /**
     * Прямой проброс в `Fastify(opts)`.
     *
     * Примеры:
     *   - `logger: false` — отключить Fastify-логи;
     *   - `trustProxy: true` — за прокси;
     *   - `bodyLimit: 1048576` — размер тела запроса;
     *   - `disableRequestLogging: true` — тише.
     *
     * Дефолт: `{ logger: { level: 'info' } }`.
     */
    fastify?: FastifyServerOptions
    /** Настройки JSON-RPC 2.0. `false` — отключить. */
    rpc?: false | RpcOptions
    /**
     * Компоненты-обёртки. Пути от `clientDir` в формате `<file>:<export>`
     * (или `<file>` для default).
     */
    components?: {
        /** Fallback для ErrorBoundary. */
        error?: string
        /** Показывается во время первого SPA-prefetch (`?noSSR` / `ssr: false`). */
        loading?: string
        /** Рендерится при 404 (SSR). */
        notFound?: string
    }
}

/**
 * Роутер-контекст для клиента (state в `NixoProvider`).
 *
 * Используется хуками `useRouter`, `useParams`, `useQuery`, `usePathname`.
 */
export interface NixoClientRouter {
    /** Текущий путь. */
    path: string
    /** Динамические сегменты (Phase 2.5, сейчас пусто). */
    params: Record<string, string>
    /** Query-параметры. */
    query: Record<string, string>
    /** id текущего маршрута. */
    routeId: string
}

/**
 * Конфиг после нормализации: все обязательные поля заполнены дефолтами.
 *
 * Используется внутри фреймворка (сканер, дерево маршрутов, манифест,
 * серверный рантайм) — там, где хочется видеть конкретные значения,
 * а не `undefined`.
 */
export interface ResolvedNixoConfig {
    ssr: boolean
    clientDir: string
    serverDir: string
    layouts: Record<string, string>
    middleware: MiddlewareDef[],
    server: {
        port: number
        host: string
        routes: string | null
        plugins: string | null
    }
    vite: Record<string, unknown>
    build: {
        outDir: string
    }
    css: {
        main: string
    }
    runtimeConfig: {
        public: Record<string, unknown>
    },
    fastify?: FastifyServerOptions
    rpc: ResolvedRpcOptions
    components: {
        error: string | null
        loading: string | null
        notFound: string | null
    }
}

/**
 * Конфигурация фабрики данных.
 *
 * Возвращается из `getConfig` (см. `configLoader`) и из `defineGlobalLoader`.
 */
export interface FactoryDef {
    /** Путь до модуля-фабрики (`<file>:<export>` или `<file>` для default). */
    dataFactoryName: string
    /** Статические аргументы, передаваемые в `loadData`. */
    dataFactoryArguments?: Record<string, unknown>
    /**
     * Зависимости: имена других фабрик текущей страницы
     * или глобальных loaders. Коллизии запрещены (A3).
     */
    dependencies?: string[],
    /** Fastify-опции (пробрасываются как есть). */
    fastify?: FastifyServerOptions
}

/**
 * Карта фабрик: имя → описание.
 *
 * Используется как возвращаемое значение `getConfig` и как содержимое
 * `defineGlobalLoader`.
 */
export type FactoryMap = Record<string, FactoryDef>

/**
 * Реализация фабрики (то, что экспортируется по `dataFactoryName`).
 *
 * Имя слайса в реестре = ключ фабрики в `getConfig` / `defineGlobalLoader`.
 * Поле `slice` — конструктор класса, наследника `Slice<TState>`.
 */
export interface FactoryImplementation<TState = unknown> {
    /**
     * Загружает данные фабрики.
     *
     * @param args смерженные аргументы.
     * @param deps уже загруженные зависимости.
     * @param ctx контекст (`router`, служебные поля).
     * @returns объект, который попадёт в `slice` через `hydrate`.
     */
    loadData: (
        args: Record<string, unknown>,
        deps: Record<string, unknown>,
        ctx: Record<string, unknown>,
    ) => Promise<unknown>

    /** Класс слайса. */
    slice: new () => Slice<TState>

    /** Динамическое обогащение `args` (мержится поверх `dataFactoryArguments`). */
    getDataFactoryArguments?: () => Promise<Record<string, unknown>>
}

/**
 * Один маршрут, возвращаемый из `router.ts` через `defineRoute([...])`.
 */
export interface NixoRoute {
    /** URL-сегмент и глобальный уникальный идентификатор. */
    id: string
    /** Идентификатор родителя (для иерархии URL). */
    parentId?: string
    /** Заголовок страницы. */
    title: string
    /** Необязательное описание. */
    description?: string
    /** Ключ layout'а из `config.layouts`. */
    type: string
    /**
     * Если `true` — собственный `id` не попадает в URL.
     * Глобально допустим только один такой маршрут.
     */
    index?: boolean
    /** Конфигурация контента: шаблон и prefetch-пайплайн. */
    contentConfig: {
        workspaceConfig: {
            /** Путь до компонента (`<file>:<export>` или `<file>`). */
            template: string
            /** Статические props, передаваемые в компонент. */
            templateProps?: Record<string, unknown>
        }
        prefetchConfig: {
            /** Путь до модуля с `export default function getConfig(configParams, router)`. */
            configLoader: string
            /** Аргументы, передаваемые в `getConfig`. */
            configParams?: Record<string, unknown>
            /** Имена глобальных loaders, от которых зависит страница. */
            dependencies?: string[]
        }
    }
    /** Свободные пользовательские данные (расширяемость). */
    meta?: Record<string, unknown>
    /**
     * Middleware для страницы. Client — `client/middleware/*.ts`,
     * server — `server/middleware/*.ts`. Наследуется по `parentId`.
     */
    middleware?: MiddlewareDef[]
    /**
     * URL-паттерн. Если задан — используется как есть (абсолютный, `/...`),
     * игнорируя цепочку `parentId → id`. `:param` — динамические сегменты.
     */
    path?: string
    /**
     * Сегменты, добавляемые к цепочке `parentId → id`. Взаимоисключающий с `path`.
     *
     * - `':param'` — именованный параметр, `params.param = value`.
     * - `'/regex:body'` — regex (nixo сам оборачивает в `^(body)$`,
     *   захватывающая группа получает имя `slug` или `slug1`, `slug2`...).
     * - `'literal'` — статический сегмент, без параметров.
     */
    slug?: string[]
    /**
     * Переопределяет `config.ssr` для этого маршрута.
     *
     * - `false` — SPA: без SSR-рендера, без server middleware, без prefetch
     *   на сервере. Клиент сам делает `clientPrefetch` + `createRoot`.
     * - `undefined` / `true` — наследует `config.ssr`.
     *
     * `index: true` + `ssr: false` — ошибка (индексная страница должна быть SSR).
     * При `config.ssr: false` игнорируется (весь проект — SPA).
     */
    ssr?: boolean
}

/**
 * Объект `router`, передаваемый в `getConfig` и `loadData` через `ctx`.
 */
export interface NixoRouter {
    /** Идентификатор текущего маршрута. */
    id: string
    /** Полный URL-путь. */
    path: string
    /** Динамические сегменты URL (Phase 3). */
    params: Record<string, string>
    /** Query-параметры. */
    query: Record<string, string>
    /** Сырой request (FastifyRequest на сервере, обёртка на клиенте). */
    request: unknown
}

/**
 * Построенное дерево маршрутов: карта `id → путь` и индексный маршрут.
 */
export interface RouteTree {
    /** Все маршруты по `id`. */
    byId: Map<string, NixoRoute>
    /** URL-путь для каждого `id`. */
    paths: Map<string, string>
    /** `id` индексного маршрута (единственного глобально), если он есть. */
    indexRouteId: string | null
    /** Скомпилированные паттерны (для `matchRoute`). */
    compiled: CompiledRoute[]
    /** Цепочка layouts (type'ы от root к leaf) для каждого маршрута. */
    layoutChains: Map<string, string[]>
}

/** Скомпилированный паттерн маршрута. */
export interface CompiledRoute {
    /** id маршрута. */
    id: string
    /** Оригинальный паттерн (`/blog/:slug`). */
    path: string
    /** Источник regex без флагов (`^/blog/([^/]+)$`). */
    regexSource: string
    /** Имена параметров в порядке появления. */
    paramNames: string[]
}

/**
 * Вид модуля в манифесте — определяет, как его резолвить и подключать.
 */
export type ModuleKind =
    | 'component'
    | 'routes'
    | 'config'
    | 'factory'
    | 'layout'
    | 'globalLoader'

/**
 * Запись манифеста для одного модуля.
 */
export interface ManifestEntry {
    /** Вид модуля. */
    kind: ModuleKind
    /** Путь до JS/TS-модуля (для загрузки). */
    js: string
    /** CSS-файлы, ассоциированные с модулем (Phase 1b). */
    css?: string[]
}

/**
 * Манифест всех модулей, сгенерированный на этапе сканирования.
 */
export interface Manifest {
    /** Версия манифеста (хеш от содержимого). */
    version: string
    /** Записи модулей по их именам. */
    modules: Record<string, ManifestEntry>
}

/**
 * Результат сканирования клиентского каталога.
 */
export interface ScanResult {
    /** Найденные модули `router.ts` и их содержимое (вызовы `defineRoute`). */
    routeModules: Array<{ file: string; routes: NixoRoute[] }>
    /** Найденные `*.loader.ts` и их карты глобальных загрузчиков. */
    loaderModules: Array<{ file: string; map: FactoryMap }>
}

// ============================================================================
// RPC (JSON-RPC 2.0)
// ============================================================================

/** Ошибка валидации Standard Schema. */
export interface StandardSchemaV1Issue {
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
}

/** Успешный результат валидации. */
export interface StandardSchemaV1Success<Output> {
    readonly value: Output
    readonly issues?: undefined
}

/** Неуспешный результат валидации. */
export interface StandardSchemaV1Failure {
    readonly issues: ReadonlyArray<StandardSchemaV1Issue>
}

/** Результат валидации. */
export type StandardSchemaV1Result<Output> =
    | StandardSchemaV1Success<Output>
    | StandardSchemaV1Failure

/**
 * Standard Schema интерфейс (valibot, zod, arktype, effect-schema).
 *
 * Nixo не зависит от конкретной библиотеки валидации — принимает любую,
 * реализующую `~standard`. Стандарт: https://standardschema.dev
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    readonly '~standard': {
        readonly version: 1
        readonly vendor: string
        readonly validate: (
            value: unknown,
        ) =>
            | StandardSchemaV1Result<Output>
            | Promise<StandardSchemaV1Result<Output>>
    }
    /** Фантомные поля для вывода типа (не используются в рантайме). */
    readonly '~nixo-input'?: Input
    readonly '~nixo-output'?: Output
}

/** Схема параметров RPC-метода. */
export type RpcParamsSchema<P> = StandardSchemaV1<unknown, P>

/** Требование авторизации для метода. */
export type AuthRequirement =
    | false
    | undefined
    | true
    | {
    /** Требуется одна из ролей (массив = OR). */
    roles: string[]
}

/**
 * Описание одного RPC-метода.
 *
 * @template P тип параметров (после валидации).
 * @template R тип результата.
 */
export interface RpcMethodDefinition<P = unknown, R = unknown> {
    /** Комментарий для админки. */
    description?: string
    /** Схема параметров (Standard Schema). */
    params?: RpcParamsSchema<P>
    /** `false`/`undefined` — публичный; `true` — нужен пользователь; `{ roles }` — роли. */
    auth?: AuthRequirement
    /**
     * Обработчик бизнес-логики.
     *
     * @param params валидированные параметры.
     * @param ctx контекст (requestId, call, расширения из `config.rpc.extendContext`).
     * @returns результат (сериализуется как `result` в JSON-RPC).
     */
    handler: (params: P, ctx: RpcContext) => R | Promise<R>
    /** Произвольные метаданные (UI, аудит); не участвуют в обработке. */
    meta?: Record<string, unknown>
    /**
     * Внутренний метод: доступен только через `ctx.call`.
     * Снаружи (HTTP → `/service`) вернёт `-32601 Method not found`.
     */
    internal?: boolean
}

/**
 * Описание объекта бизнес-логики (Users, Staff, Employees...).
 *
 * Имя уникально; методы объекта задаются в `methods`.
 * Полное имя метода: `${name}.${methodKey}`, например `Users.List`.
 */
export interface RpcObjectDefinition {
    /** Имя объекта: `[A-Za-z][A-Za-z0-9_]*`. */
    name: string
    /** Комментарий для админки. */
    description?: string
    /** Методы объекта (ключи — `List`, `Read`, `Create`, ...). */
    methods: Record<string, RpcMethodDefinition<unknown, unknown>>
    /** Произвольные метаданные. */
    meta?: Record<string, unknown>
}

/**
 * Контекст, передаваемый в `RpcMethodDefinition.handler`.
 *
 * Расширяется прикладником через `config.rpc.extendContext` +
 * module augmentation (`declare module 'nixo/server' { interface RpcContext {...} }`).
 */
export interface RpcContext {
    /** ID запроса (из `X-Request-Id` или сгенерирован nixo). */
    requestId: string
    /**
     * JSON-RPC вызов через `Service` (изоморфный).
     *
     * На сервере — прямой вызов из реестра объектов (без HTTP).
     * На клиенте — `fetch('/service')`.
     * Для `internal: true` — единственный способ вызвать.
     */
    call: <R = unknown>(method: string, params?: unknown) => Promise<R>
    /** Расширения из `config.rpc.extendContext`. */
    [key: string]: unknown
}

/** Опции RPC-слоя. */
export interface RpcOptions {
    /** Включён ли RPC. По умолчанию `true`. */
    enabled?: boolean
    /** URL endpoint. По умолчанию `/service`. */
    url?: string
    /** Включить `System.Describe` (по умолчанию `true`). */
    describe?: boolean
    /**
     * Расширение контекста. Вызывается на каждый `/service` запрос и на каждый
     * `ctx.call` при SSR (чтобы контекст был изолирован).
     *
     * @param req Fastify-запрос (только на сервере).
     * @returns объект для мержа в `RpcContext`.
     */
    extendContext?: (
        req: unknown,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>
}

/** Резолвнутые опции RPC. */
export interface ResolvedRpcOptions {
    enabled: boolean
    url: string
    describe: boolean
    extendContext?: (
        req: unknown,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>
}

/** Изоморфный исполнитель JSON-RPC (регистрируется сервером в ALS). */
export type RpcExecutor = (
    payload: string,
    headers: Record<string, string>,
) => Promise<Response>

/** CRUD-операции для `IBinding`. */
export type CrudOp = 'read' | 'query' | 'create' | 'update' | 'destroy'

/**
 * Соответствие CRUD-методов `Service` именам методов объекта БЛ.
 *
 * Если не задано — дефолты: `read → Read`, `query → List`,
 * `create → Create`, `update → Update`, `destroy → Delete`.
 */
export type IBinding = Partial<Record<CrudOp, string>>

/** Опции `Service`. */
export interface ServiceOptions {
    /** URL endpoint. По умолчанию `/service`. */
    url?: string
    /** Имя объекта БЛ (`Users`, `Staff`, ...). */
    endpoint?: string
    /** Конкретный метод (`List`) — для `call`-style без binding. */
    method?: string
    /** Маппинг CRUD → метод. */
    binding?: IBinding
    /** Таймаут запроса в миллисекундах. */
    timeout?: number
    /**
     * TTL кэша по умолчанию (ms). Не задан / `0` — кэш выключен.
     * Per-call override — `call(method, params, { cache })`.
     */
    cache?: number
}

/** Запись в кэше `NixoService`. */
export interface ServiceCacheEntry {
    /** Результат вызова. */
    value: unknown
    /** Timestamp истечения (ms, `Date.now()`). */
    expiresAt: number
}

/** Опции per-call (`service.call(method, params, opts)`). */
export interface CallOptions {
    /** TTL кэша для этого вызова (ms). `false` — не кэшировать. */
    cache?: number | false
}
