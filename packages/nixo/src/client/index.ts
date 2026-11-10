/**
 * Публичный API клиентской части nixo.
 *
 * Используется как `import { ... } from 'nixo/client'`.
 *
 * Содержит всё из `nixo` (pure, без jiti) + React-специфику.
 */

// Pure API из `nixo` (defineNixoConfig, Slice, NixoError, computePath, types).
export * from '../index'

// React-специфика.
export { NixoProvider, useResourceContext } from './context/NixoProvider'
export type { NixoContextValue, NixoProviderProps } from './context/NixoProvider'

export { useSlice } from './hooks/useSlice'
export { useStrictSlice } from './hooks/useStrictSlice'
export { useSliceRef } from './hooks/useSliceRef'
export { useSliceInternal } from './hooks/useSliceInternal'
export type { UseSliceInternalOptions } from './hooks/useSliceInternal'
export { useRouter } from './hooks/useRouter'
export type { NixoRouterApi } from './hooks/useRouter'
export { useParams } from './hooks/useParams'
export { useQuery } from './hooks/useQuery'
export { usePathname } from './hooks/usePathname'

export { Link } from './Link'
export type { LinkProps } from './Link'

export { Service as NixoService } from './rpc/Service'
export { Remote } from './rpc/Remote'
export type { ServiceOptions, CrudOp, IBinding } from '../types'
export { Outlet, OutletProvider, renderLayoutChain } from './layout'
export { NixoErrorBoundary } from './error-boundary'
export type { NixoErrorBoundaryProps } from './error-boundary'
export { NixoLoading } from './loading'
export { NixoNotFound } from './not-found'
// devalue — для `__NIXO_STATE_STR__` (Map, Set, Date, BigInt, cyclic).
export { parse as devalueParse, stringify as devalueStringify } from 'devalue'
