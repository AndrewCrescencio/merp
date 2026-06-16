import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSession = vi.fn()
const mockGetCookie = vi.fn()
const mockGetRequestURL = vi.fn()
const mockSendAuthError = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
  getCookie: (...args: any[]) => mockGetCookie(...args),
  getRequestURL: (...args: any[]) => mockGetRequestURL(...args),
}))

vi.mock('#shared/auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}))

vi.mock('#shared/logger', () => ({
  logger: { warn: mockLoggerWarn },
}))

vi.mock('~~/server/utils/auth/helpers', () => ({
  sendAuthError: mockSendAuthError,
}))

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/me'))
    mockSendAuthError.mockImplementation((status: number, error: string, message: string) => {
      const err: any = new Error(message)
      err.status = status
      err.error = error
      throw err
    })
  })

  it('skips auth for public routes', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/register'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    const result = await handler(event)

    expect(result).toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('skips auth for login route', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/login'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    await handler(event)

    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('sets user and session context on valid session', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'Test User' }
    const session = { id: 'session-1', userId: 'user-1' }
    mockGetSession.mockResolvedValue({ user, session })

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await handler(event)

    expect(event.context.user).toEqual(user)
    expect(event.context.session).toEqual(session)
  })

  it('returns unauthorized when no session and no cookie', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetCookie.mockReturnValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('returns session_expired when session cookie exists but session expired', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetCookie.mockReturnValue('expired-token-value')

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow('Session expired. Please login again.')
  })

  it('logs session_expired event when session is expired', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetCookie.mockReturnValue('expired-token-value')

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'session_expired',
      expect.objectContaining({
        event: 'session_expired',
        path: '/api/auth/me',
      }),
    )
  })

  it('does not log for unauthorized (no cookie)', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetCookie.mockReturnValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })
})
