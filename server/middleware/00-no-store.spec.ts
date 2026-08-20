import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRequestURL = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRequestURL: (...args: any[]) => mockGetRequestURL(...args),
  setResponseHeaders: (event: any, headers: Record<string, string>) => {
    event.resHeaders = { ...(event.resHeaders ?? {}), ...headers }
  },
}))

const NO_STORE = 'no-store, no-cache, must-revalidate'

describe('No-store middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AUD-17: sets no-store on /api/ paths', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/me'))

    const handler = await import('~~/server/middleware/00-no-store').then((m) => m.default)
    const event = { resHeaders: {} } as any

    await handler(event)

    expect(event.resHeaders['cache-control']).toBe(NO_STORE)
  })

  it('AUD-17: does not set no-store on non-/api/ paths', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/'))

    const handler = await import('~~/server/middleware/00-no-store').then((m) => m.default)
    const event = { resHeaders: {} } as any

    await handler(event)

    expect(event.resHeaders['cache-control']).toBeUndefined()
  })

  it('AUD-17: headers stay on the event when the handler throws', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/me'))

    const handler = await import('~~/server/middleware/00-no-store').then((m) => m.default)
    const event = { resHeaders: {} } as any

    await handler(event)

    await expect(Promise.reject(new Error('handler crashed'))).rejects.toThrow()
    expect(event.resHeaders['cache-control']).toBe(NO_STORE)
  })
})
