import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuth = vi.fn()
const mockGetSession = vi.fn()
const mockGetCookie = vi.fn()
const mockGetRequestURL = vi.fn()
const mockSendAuthError = vi.fn()
const mockSendAuthUnavailableError = vi.fn()
const mockLoggerWarn = vi.fn()
const mockLoggerError = vi.fn()
const mockCreateAuthEvent = vi.fn()

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
  getAuth: mockGetAuth,
}))

vi.mock('#shared/logger', () => ({
  logger: { warn: mockLoggerWarn, error: mockLoggerError },
}))

vi.mock('~~/server/utils/auth/helpers', () => ({
  sendAuthError: mockSendAuthError,
  sendAuthUnavailableError: mockSendAuthUnavailableError,
}))

vi.mock('~~/server/utils/auth/repository', () => ({
  authRepository: { createAuthEvent: mockCreateAuthEvent },
}))

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/me'))
    mockGetAuth.mockResolvedValue({ api: { getSession: mockGetSession } })
    mockCreateAuthEvent.mockResolvedValue(undefined)
    mockSendAuthError.mockImplementation((status: number, error: string, message: string) => {
      const err: any = new Error(message)
      err.status = status
      err.error = error
      throw err
    })
    mockSendAuthUnavailableError.mockImplementation(() => {
      throw new Error('Authentication service is starting. Please try again.')
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

  it('skips auth for health route', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/health'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    const result = await handler(event)

    expect(result).toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('returns 503 auth_unavailable when auth instance cannot be resolved', async () => {
    mockGetAuth.mockRejectedValue(new Error('auth init failed'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow(
      'Authentication service is starting. Please try again.',
    )
    expect(mockSendAuthUnavailableError).toHaveBeenCalled()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('sets user and session context on valid session', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'Test User' }
    const session = { id: 'session-1', userId: 'user-1', activeCompanyId: 'company-1' }
    mockGetSession.mockResolvedValue({ user, session })
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await handler(event)

    expect(event.context.user).toEqual(user)
    expect(event.context.session).toEqual(session)
  })

  it('emits session_validated event on valid session', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'Test User' }
    const session = { id: 'session-1', userId: 'user-1', activeCompanyId: 'company-1' }
    mockGetSession.mockResolvedValue({ user, session })
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'session_validated',
      metadata: {
        sessionId: 'session-1',
        userId: 'user-1',
        tenantId: 'company-1',
      },
    })
  })

  it('emits session_validated with null tenantId when no active company', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'Test User' }
    const session = { id: 'session-1', userId: 'user-1' }
    mockGetSession.mockResolvedValue({ user, session })
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'session_validated',
      metadata: {
        sessionId: 'session-1',
        userId: 'user-1',
        tenantId: null,
      },
    })
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
    mockCreateAuthEvent.mockResolvedValue(undefined)

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

  it('emits session_expired auth event when session cookie exists but expired', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetCookie.mockReturnValue('expired-token-value')
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: null,
      email: 'unknown',
      eventType: 'session_expired',
      metadata: {
        sessionId: null,
        userId: null,
        tenantId: null,
      },
    })
  })

  it('does not emit session_expired event for unauthorized (no cookie)', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetCookie.mockReturnValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockCreateAuthEvent).not.toHaveBeenCalled()
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
