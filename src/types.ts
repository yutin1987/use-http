import { ReactNode } from 'react'

export enum HTTPMethod {
  DELETE = 'DELETE',
  GET = 'GET',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  PATCH = 'PATCH',
  POST = 'POST',
  PUT = 'PUT',
}

// https://www.apollographql.com/docs/react/api/react-apollo/#optionsfetchpolicy
export enum CachePolicies {
  /**
   * This is the default value where we always try reading data
   * from your cache first. If all the data needed to fulfill
   * your query is in the cache then that data will be returned.
   * useFetch will only fetch from the network if a cached result
   * is not available. This fetch policy aims to minimize the number
   * of network requests sent when rendering your component.
   */
  CACHE_FIRST = 'cache-first',
  /**
   * This fetch policy will have useFetch first trying to read data
   * from your cache. If all the data needed to fulfill your query
   * is in the cache then that data will be returned. However,
   * regardless of whether or not the full data is in your cache
   * this fetchPolicy will always execute query with the network
   * interface unlike cache-first which will only execute your query
   * if the query data is not in your cache. This fetch policy optimizes
   * for users getting a quick response while also trying to keep
   * cached data consistent with your server data at the cost of extra
   * network requests.
   */
  CACHE_AND_NETWORK = 'cache-and-network', // not implemented
  /**
   * This fetch policy will never return your initial data from the
   * cache. Instead it will always make a request using your network
   * interface to the server. This fetch policy optimizes for data
   * consistency with the server, but at the cost of an instant response
   * to the user when one is available.
   */
  NETWORK_ONLY = 'network-only', // not implemented
  /**
   * This fetch policy will never execute a query using your network
   * interface. Instead it will always try reading from the cache. If the
   * data for your query does not exist in the cache then an error will be
   * thrown. This fetch policy allows you to only interact with data in
   * your local client cache without making any network requests which
   * keeps your component fast, but means your local data might not be
   * consistent with what is on the server.
   */
  CACHE_ONLY = 'cache-only', // not implemented
  /**
   * This fetch policy will never return your initial data from the cache.
   * Instead it will always make a request using your network interface to
   * the server. Unlike the network-only policy, it also will not write
   * any data to the cache after the query completes.
   */
  NO_CACHE = 'no-cache', // not implemented
  EXACT_CACHE_AND_NETWORK = 'exact-cache-and-network', // not implemented
}

export interface DoFetchArgs {
  url: string
  options: RequestInit
  response: {
    isCached: boolean
    id: string
    cached?: Response
  }
}

export interface FetchContextTypes {
  url: string
  options: Options
  graphql?: boolean
}

export interface FetchProviderProps {
  url?: string
  options?: Options
  graphql?: boolean
  children: ReactNode
}

export type BodyOnly = (body: BodyInit | object) => Promise<any>

export type RouteOnly = (route: string) => Promise<any>

export type RouteAndBodyOnly = (
  route: string,
  body: BodyInit | object,
) => Promise<any>

export type RouteOrBody = string | BodyInit | object
export type Body = BodyInit | object
export type RetryOpts = { attempt: number, error?: Error, response?: Response }

export type NoArgs = () => Promise<any>

export type FetchData = (
  routeOrBody?: string | BodyInit | object,
  body?: BodyInit | object,
) => Promise<any>

export type RequestInitJSON = RequestInit & {
  headers: {
    'Content-Type': string
  }
}

export interface ReqMethods {
  get: (route?: string) => Promise<any>
  post: FetchData
  patch: FetchData
  put: FetchData
  del: FetchData
  delete: FetchData
  query: (query: string, variables?: BodyInit | object) => Promise<any>
  mutate: (mutation: string, variables?: BodyInit | object) => Promise<any>
  abort: () => void
}

export interface Data<TData> {
  data: TData | undefined
}

export interface ReqBase<TData> {
  data: TData | undefined
  loading: boolean
  error: Error
  cache: Cache
}

export interface Res<TData> extends Response {
  data?: TData | undefined
}

export type Req<TData = any> = ReqMethods & ReqBase<TData>

export type UseFetchArgs = [(string | OptionsMaybeURL | OverwriteGlobalOptions)?, (NoUrlOptions | OverwriteGlobalOptions | any[])?, any[]?]

export type UseFetchArrayReturn<TData> = [
  Req<TData>,
  Res<TData>,
  boolean,
  Error,
]

export type UseFetchObjectReturn<TData> = ReqBase<TData> &
  ReqMethods & {
    request: Req<TData>
    response: Res<TData>
  }

export type UseFetch<TData> = UseFetchArrayReturn<TData> &
  UseFetchObjectReturn<TData>

export type Interceptors = {
  request?: (options: Options, url: string, path: string, route: string) => Promise<Options> | Options
  response?: (response: Res<any>) => Promise<Res<any>>
}

// this also holds the response keys. It mimics js Map
export type Cache = {
  get: (name: string) => Promise<Response | undefined>
  set: (name: string, data: Response) => Promise<void>
  has: (name: string) => Promise<boolean>
  delete: (...names: string[]) => Promise<void>
  clear: () => void
}

export interface CustomOptions {
  cacheLife?: number
  cachePolicy?: CachePolicies
  data?: any
  interceptors?: Interceptors
  loading?: boolean
  onAbort?: () => void
  onNewData?: (currData: any, newData: any) => any
  onTimeout?: () => void
  path?: string
  persist?: boolean
  perPage?: number
  retries?: number
  retryOn?: RetryOn
  retryDelay?: RetryDelay
  suspense?: boolean
  timeout?: number
  url?: string
}

export type Options = CustomOptions &
  Omit<RequestInit, 'body'> & { body?: BodyInit | object | null }

export type NoUrlOptions = Omit<Options, 'url'>

export type OptionsMaybeURL = NoUrlOptions &
  Partial<Pick<Options, 'url'>> & { url?: string }

// TODO: this is still yet to be implemented
export type OverwriteGlobalOptions = (options: Options) => Options

export type RetryOn = (<TData = any>({ attempt, error, response }: { attempt: number, error: Error, response: Res<TData> | null }) => boolean) | number[]
export type RetryDelay = (<TData = any>({ attempt, error, response }: { attempt: number, error: Error, response: Res<TData> | null }) => number) | number

export type UseFetchArgsReturn = {
  customOptions: {
    cacheLife: number
    cachePolicy: CachePolicies
    interceptors: Interceptors
    onAbort: () => void
    onNewData: (currData: any, newData: any) => any
    onTimeout: () => void
    path: string
    perPage: number
    persist: boolean
    retries: number
    retryDelay: RetryDelay
    retryOn: RetryOn | undefined
    suspense: boolean
    timeout: number
    url: string
  }
  requestInit: RequestInit
  defaults: {
    loading: boolean
    data?: any
  }
  dependencies?: any[]
}

/**
 * Helpers
 */
export type ValueOf<T> = T[keyof T]

export type NonObjectKeysOf<T> = {
  [K in keyof T]: T[K] extends Array<any> ? K : T[K] extends object ? never : K
}[keyof T]

export type ObjectValuesOf<T extends Record<string, any>> = Exclude<
  Exclude<Extract<ValueOf<T>, object>, never>,
  Array<any>
>

export type UnionToIntersection<U> = (U extends any
  ? (k: U) => void
  : never) extends ((k: infer I) => void)
  ? I
  : never

export type Flatten<T> = Pick<T, NonObjectKeysOf<T>> & UnionToIntersection<ObjectValuesOf<T>>
