/**
 * Публичный API клиентской части setti.
 *
 * Используется как `import { ... } from 'setti/client'`.
 *
 * Содержит всё из `setti` (pure, без jiti) + React-специфику.
 */

// Pure API из `setti` (defineSettiConfig, Slice, SettiError, computePath, types).
export * from '../index'

// React-специфика.
export { SettiProvider, useResourceContext } from './context/SettiProvider'
export type { SettiContextValue, SettiProviderProps } from './context/SettiProvider'

export { useSlice } from './hooks/useSlice'
export { useStrictSlice } from './hooks/useStrictSlice'
export { useSliceRef } from './hooks/useSliceRef'
export { useSliceInternal } from './hooks/useSliceInternal'
export type { UseSliceInternalOptions } from './hooks/useSliceInternal'
export { useRouter } from './hooks/useRouter'
export type { SettiRouterApi } from './hooks/useRouter'
export { useParams } from './hooks/useParams'
export { useQuery } from './hooks/useQuery'
export { usePathname } from './hooks/usePathname'

export { Link } from './Link'
export type { LinkProps } from './Link'

export { Service as SettiService } from './rpc/Service'
export { Remote } from './rpc/Remote'
export type { ServiceOptions, CrudOp, IBinding } from '../types'
export { Outlet, OutletProvider, renderLayoutChain } from './layout'
export { SettiErrorBoundary } from './error-boundary'
export type { SettiErrorBoundaryProps } from './error-boundary'
export { SettiLoading } from './loading'
export { SettiNotFound } from './not-found'
// devalue — для `__SETTI_STATE_STR__` (Map, Set, Date, BigInt, cyclic).
export { parse as devalueParse, stringify as devalueStringify } from 'devalue'
