export type ApiFetchOptions = Record<string, unknown> & { headers?: HeadersInit }
export type ApiFetcher = (url: string, options: ApiFetchOptions) => Promise<unknown>

export function isInternalApiPath(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//')) return false
  try {
    return new URL(url, 'https://merp.internal').origin === 'https://merp.internal'
  } catch {
    return false
  }
}

export function createApiTransport(fetcher: ApiFetcher, getCsrfToken: () => string | null) {
  return async <T>(url: string, options: ApiFetchOptions = {}): Promise<T> => {
    const csrfToken = getCsrfToken()
    const headers = new Headers(options.headers)
    if (csrfToken && !headers.has('x-csrf-token')) headers.set('x-csrf-token', csrfToken)

    try {
      return (await fetcher(url, { ...options, headers })) as T
    } catch (error: unknown) {
      const err = error as { data?: unknown; status?: number }
      if (err.data && typeof err.data === 'object' && 'error' in err.data) {
        const data = err.data as { error: string; message?: string }
        throw Object.assign(new Error(data.message || 'Request failed'), {
          code: data.error,
          status: err.status,
          data: err.data,
        })
      }
      throw error
    }
  }
}
