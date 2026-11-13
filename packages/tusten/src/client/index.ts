// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient-тип `i18n!*` — глобальный скрипт, импортом не подключается. В dist ссылку дописывает scripts/postbuild.mjs.
/// <reference path="../../types/i18n.d.ts" />
/**
 * Публичный API клиентской части tusten.
 *
 * Используется как `import { ... } from '@tusten/core/client'`.
 *
 * Содержит всё из `tusten` (pure, без jiti) + React-специфику.
 */

// Pure API из `tusten` (defineConfig, Slice, TustenError, computePath, types).
export * from '../index'

// React-специфика.
export { RootProvider, useResourceContext } from './context/RootProvider'
export type { TustenContextValue, RootProviderProps } from './context/RootProvider'

export { useSlice } from './hooks/useSlice'
export { useStrictSlice } from './hooks/useStrictSlice'
export { useSliceRef } from './hooks/useSliceRef'
export { useSliceInternal } from './hooks/useSliceInternal'
export type { UseSliceInternalOptions } from './hooks/useSliceInternal'
export { useRouter, getRouter } from './hooks/useRouter'
export type { TustenRouterApi } from './hooks/useRouter'
export { useParams } from './hooks/useParams'
export { useQuery } from './hooks/useQuery'
export { usePathname } from './hooks/usePathname'

export { Link } from './Link'
export type { LinkProps } from './Link'

export { Service } from './rpc/Service'
export { Remote } from './rpc/Remote'
export type { ServiceOptions, CrudOp, IBinding } from '../types'
export { Outlet, OutletProvider, renderLayoutChain } from './layout'
export { RootErrorBoundary } from './error-boundary'
export type { RootErrorBoundaryProps } from './error-boundary'
export { RootLoading } from './loading'
export { RootNotFound } from './not-found'
// devalue — для `__ROOT_STATE_STR__` (Map, Set, Date, BigInt, cyclic).
export { parse as devalueParse, stringify as devalueStringify } from 'devalue'
export { usePageMeta } from './hooks/usePageMeta'
export type { UsePageMetaOptions } from './hooks/usePageMeta'

// i18n: runtime-перевод модулей (`import rk from 'i18n!<Module>'`) и интерполяция.
export { createRk } from './i18n/create-rk'
export type { RkFunction, I18nDictionary, I18nLoader } from './i18n/create-rk'
export { template } from './i18n/template'
export type { TemplateParams } from './i18n/template'
export { getLocale, setLocale, setLocaleResolver } from './i18n/locale'
export type { LocaleResolver } from './i18n/locale'
// Внутреннее: сгенерированные entry (клиентский и SSR) передают сюда данные из HTML.
export {
    initI18n,
    loadRegisteredDictionaries,
    getRegisteredDictionary,
    setI18nUsageHook,
} from './i18n/runtime'
export type { I18nBootstrap } from './i18n/runtime'
