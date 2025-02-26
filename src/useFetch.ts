import { useEffect, useState, useCallback, useRef, useReducer, useMemo } from 'react'
import useSSR from 'use-ssr'
import {
  HTTPMethod,
  UseFetch,
  ReqMethods,
  Req,
  Res,
  UseFetchArrayReturn,
  UseFetchObjectReturn,
  UseFetchArgs,
  CachePolicies,
  FetchData,
  NoArgs,
  RouteOrBody,
  Body,
  RetryOpts
} from './types'
import useFetchArgs from './useFetchArgs'
import doFetchArgs from './doFetchArgs'
import { invariant, tryGetData, toResponseObject, useDeepCallback, isFunction, sleep, makeError } from './utils'
import useCache from './useCache'

const { CACHE_FIRST } = CachePolicies


function useFetch<TData = any>(...args: UseFetchArgs): UseFetch<TData> {
  const { customOptions, requestInit, defaults, dependencies } = useFetchArgs(...args)
  const {
    cacheLife,
    cachePolicy, // 'cache-first' by default
    interceptors,
    onAbort,
    onNewData,
    onTimeout,
    path,
    perPage,
    persist,
    retries,
    retryDelay,
    retryOn,
    suspense,
    timeout,
    url: initialURL,
  } = customOptions

  const cache = useCache({ persist, cacheLife, cachePolicy })

  const { isServer } = useSSR()

  const controller = useRef<AbortController>()
  const res = useRef<Res<TData>>({} as Res<TData>)
  const data = useRef<TData>(defaults.data)
  const timedout = useRef(false)
  const attempt = useRef(0)
  const error = useRef<any>()
  const hasMore = useRef(true)
  const suspenseStatus = useRef('pending')
  const suspender = useRef<Promise<any>>()
  const mounted = useRef(false)

  const loading = useRef(defaults.loading)
  const setLoadingState = useState(defaults.loading)[1]
  const setLoading = (v: boolean) => {
    if (!mounted.current) return
    loading.current = v
    setLoadingState(v)
  }
  const forceUpdate = useReducer(() => ({}), [])[1]

  const makeFetch = useDeepCallback((method: HTTPMethod): FetchData => {

    const doFetch = async (routeOrBody?: RouteOrBody, body?: Body): Promise<any> => {
      if (isServer) return // for now, we don't do anything on the server
      controller.current = new AbortController()
      controller.current.signal.onabort = onAbort
      const theController = controller.current

      const { url, options, response } = await doFetchArgs<TData>(
        requestInit,
        initialURL,
        path,
        method,
        theController,
        cacheLife,
        cache,
        routeOrBody,
        body,
        interceptors.request
      )
      
      error.current = undefined

      if (response.isCached && cachePolicy === CACHE_FIRST) {
        try {
          res.current = response.cached as Res<TData>
          const theData = await tryGetData(response.cached, defaults.data)
          res.current.data = theData
          res.current = interceptors.response ? await interceptors.response(res.current) : res.current
          invariant('data' in res.current, 'You must have `data` field on the Response returned from your `interceptors.response`')
          data.current = res.current.data as TData
          if (!suspense && mounted.current) forceUpdate()
          return data.current
        } catch (err) {
          error.current = err
          if (mounted.current) forceUpdate()
        }
      }

      if (!suspense) setLoading(true)

      // don't perform the request if there is no more data to fetch (pagination)
      if (perPage > 0 && !hasMore.current && !error.current) return data.current

      const timer = timeout && setTimeout(() => {
        timedout.current = true
        theController.abort()
        if (onTimeout) onTimeout()
      }, timeout)

      let newData
      let newRes

      try {
        newRes = await fetch(url, options)
        res.current = newRes.clone()

        newData = await tryGetData(newRes, defaults.data)
        res.current.data = onNewData(data.current, newData)

        res.current = interceptors.response ? await interceptors.response(res.current) : res.current
        invariant('data' in res.current, 'You must have `data` field on the Response returned from your `interceptors.response`')
        data.current = res.current.data as TData

        const opts = { attempt: attempt.current, response: newRes }
        const shouldRetry = (
          // if we just have `retries` set with NO `retryOn` then
          // automatically retry on fail until attempts run out
          !isFunction(retryOn) && Array.isArray(retryOn) && retryOn.length < 1 && newRes?.ok === false
          // otherwise only retry when is specified
          || Array.isArray(retryOn) && retryOn.includes(newRes.status)
          || isFunction(retryOn) && (retryOn as Function)(opts)
        ) && retries > 0 && retries > attempt.current

        if (shouldRetry) {
          const theData = await retry(opts, routeOrBody, body)
          return theData
        }

        if (cachePolicy === CACHE_FIRST) {
          await cache.set(response.id, newRes.clone())
        }

        if (Array.isArray(data.current) && !!(data.current.length % perPage)) hasMore.current = false
      } catch (err) {
        if (attempt.current >= retries && timedout.current) error.current = makeError('AbortError', 'Timeout Error')
        const opts = { attempt: attempt.current, error: err }
        const shouldRetry = (
          // if we just have `retries` set with NO `retryOn` then
          // automatically retry on fail until attempts run out
          !isFunction(retryOn) && Array.isArray(retryOn) && retryOn.length < 1
          // otherwise only retry when is specified
          || isFunction(retryOn) && (retryOn as Function)(opts)
        ) && retries > 0 && retries > attempt.current

        if (shouldRetry) {
          const theData = await retry(opts, routeOrBody, body)
          return theData
        }
        if (err.name !== 'AbortError') error.current = makeError(err.name, err.message)
 
      } finally {
        timedout.current = false
        if (timer) clearTimeout(timer)
        controller.current = undefined
      }

      if (newRes && !newRes.ok && !error.current) error.current = makeError(newRes.status, newRes.statusText)
      if (!suspense) setLoading(false)
      if (attempt.current === retries) attempt.current = 0

      return data.current
    } // end of doFetch()

    const retry = async (opts: RetryOpts, routeOrBody?: RouteOrBody, body?: Body) => {
      const delay = (isFunction(retryDelay) ? (retryDelay as Function)(opts) : retryDelay) as number
      if (!(Number.isInteger(delay) && delay >= 0)) {
        console.error('retryDelay must be a number >= 0! If you\'re using it as a function, it must also return a number >= 0.')
      }
      attempt.current++
      if (delay) await sleep(delay)
      const d = await doFetch(routeOrBody, body)
      return d
    }

    if (suspense) {
      return async (...args) => {
        suspender.current = doFetch(...args).then(
          (newData) => {
            suspenseStatus.current = 'success'
            return newData
          },
          () => {
            suspenseStatus.current = 'error'
          }
        )
        forceUpdate()
        const newData = await suspender.current
        return newData
      }
    }

    return doFetch
  }, [isServer, onAbort, requestInit, initialURL, path, interceptors, cachePolicy, perPage, timeout, persist, cacheLife, onTimeout, defaults.data, onNewData, forceUpdate, suspense])

  const post = useCallback(makeFetch(HTTPMethod.POST), [makeFetch])
  const del = useCallback(makeFetch(HTTPMethod.DELETE), [makeFetch])

  const request: Req<TData> = useMemo(() => Object.defineProperties({
    get: makeFetch(HTTPMethod.GET),
    post,
    patch: makeFetch(HTTPMethod.PATCH),
    put: makeFetch(HTTPMethod.PUT),
    del,
    delete: del,
    abort: () => controller.current && controller.current.abort(),
    query: (query: any, variables: any) => post({ query, variables }),
    mutate: (mutation: any, variables: any) => post({ mutation, variables }),
    cache
  }, {
    loading: { get: () => loading.current },
    error: { get: () => error.current },
    data: { get: () => data.current },
  }), [makeFetch])

  const response = useMemo(() => toResponseObject<TData>(res, data), [])

  // onMount/onUpdate
  useEffect((): any => {
    mounted.current = true
    if (Array.isArray(dependencies)) {
      const methodName = requestInit.method || HTTPMethod.GET
      const methodLower = methodName.toLowerCase() as keyof ReqMethods
      const req = request[methodLower] as NoArgs
      req()
    }
    return () => mounted.current = false
  }, dependencies)

  // Cancel any running request when unmounting to avoid updating state after component has unmounted
  // This can happen if a request's promise resolves after component unmounts
  useEffect(() => request.abort, [])

  if (suspense && suspender.current) {
    if (isServer) throw new Error('Suspense on server side is not yet supported! 🙅‍♂️')
    switch (suspenseStatus.current) {
      case 'pending':
        throw suspender.current
      case 'error':
        throw error.current
    }
  }
  return Object.assign<UseFetchArrayReturn<TData>, UseFetchObjectReturn<TData>>(
    [request, response, loading.current, error.current],
    { request, response, ...request, loading: loading.current, data: data.current, error: error.current }
  )
}

export { useFetch }
export default useFetch
