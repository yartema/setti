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
export { useRouter } from './hooks/useRouter'
export type { TustenRouterApi } from './hooks/useRouter'
export { useParams } from './hooks/useParams'
export { useQuery } from './hooks/useQuery'
export { usePathname } from './hooks/usePathname'

export { Link } from './Link'
export type { LinkProps } from './Link'

export { Service as TustenService } from './rpc/Service'
export { Remote } from './rpc/Remote'
export type { ServiceOptions, CrudOp, IBinding } from '../types'
export { Outlet, OutletProvider, renderLayoutChain } from './layout'
export { RootErrorBoundary } from './error-boundary'
export type { RootErrorBoundaryProps } from './error-boundary'
export { RootLoading } from './loading'
export { RootNotFound } from './not-found'
// devalue — для `__ROOT_STATE_STR__` (Map, Set, Date, BigInt, cyclic).
export { parse as devalueParse, stringify as devalueStringify } from 'devalue'
