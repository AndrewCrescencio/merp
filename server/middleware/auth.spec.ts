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
const mockAppendResponseHeaders = vi.fn()
const mockCheckUserRateLimit = vi.fn()

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
  appendResponseHeaders: mockAppendResponseHeaders,
}))

vi.mock('#shared/auth', () => ({
  getAuth: mockGetAuth,
}))

vi.mock('#shared/logger', () => ({
  logger: { warn: mockLoggerWarn, error: mockLoggerError },
}))

vi.mock('~~/server/utils/shared/errors', () => ({
  sendAuthError: mockSendAuthError,
  sendAuthUnavailableError: mockSendAuthUnavailableError,
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

vi.mock('~~/server/utils/shared/security', () => ({
  checkUserRateLimit: mockCheckUserRateLimit,
}))

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/v1/me'))
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
    mockCheckUserRateLimit.mockResolvedValue(undefined)
  })

  it('skips auth for public routes', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/register'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    const result = await handler(event)

    expect(result).toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockCheckUserRateLimit).not.toHaveBeenCalled()
  })

  it('skips auth for login route', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/login'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    await handler(event)

    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('skips auth for health live route', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/health/live'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    const result = await handler(event)

    expect(result).toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('skips auth for health ready route', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/health/ready'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    const result = await handler(event)

    expect(result).toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('skips auth for forget-password route (starts recovery, caller is always logged out)', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/password/forgot'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    await expect(handler(event)).resolves.toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('FR-029: skips auth for send-verification-email (unverified account has no session)', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/email/verification'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    await expect(handler(event)).resolves.toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('skips auth for the public RFC 9116 security.txt', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/.well-known/security.txt'))

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    await expect(handler(event)).resolves.toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('AUD-09: skips auth for verify-email route (email link, no session)', async () => {
    mockGetRequestURL.mockReturnValue(
      new URL('http://localhost:3000/api/auth/email/verification/confirm'),
    )

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers() } as any

    const result = await handler(event)

    expect(result).toBeUndefined()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('AUD-09: skips auth for reset-password route (email link POST, no session)', async () => {
    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/password/reset'))

    const event = { headers: new Headers() } as any

    await expect(handler(event)).resolves.toBeUndefined()
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
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: { user, session } })
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
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: { user, session } })
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
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: { user, session } })
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

  it('AUD-16: checks user rate limit on valid session (limit not reached)', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'Test User' }
    const session = { id: 'session-1', userId: 'user-1', activeCompanyId: 'company-1' }
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: { user, session } })
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await handler(event)

    expect(mockCheckUserRateLimit).toHaveBeenCalledWith(event, 'user-1')
    expect(event.context.user).toEqual(user)
    expect(mockCreateAuthEvent).toHaveBeenCalled()
  })

  it('AUD-16: blocks with 429 when user rate limit exceeded, no session_validated event', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'Test User' }
    const session = { id: 'session-1', userId: 'user-1' }
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: { user, session } })
    mockCreateAuthEvent.mockResolvedValue(undefined)
    mockCheckUserRateLimit.mockRejectedValue(
      Object.assign(new Error('Too many requests. Try again later.'), { statusCode: 429 }),
    )

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 429 })
    expect(mockCreateAuthEvent).not.toHaveBeenCalled()
    expect(event.context.user).toBeUndefined()
  })

  it('returns unauthorized when no session and no cookie', async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: null })
    mockGetCookie.mockReturnValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('returns session_expired when session cookie exists but session expired', async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: null })
    mockGetCookie.mockReturnValue('expired-token-value')

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow('Session expired. Please login again.')
  })

  it('logs session_expired event when session is expired', async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: null })
    mockGetCookie.mockReturnValue('expired-token-value')
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'session_expired',
      expect.objectContaining({
        event: 'session_expired',
        path: '/api/v1/me',
      }),
    )
  })

  it('emits session_expired auth event when session cookie exists but expired', async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: null })
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

  it('forwards Set-Cookie from getSession (expired session cleanup)', async () => {
    const headers = new Headers()
    headers.append('set-cookie', 'merp-session_token=; Max-Age=0; Path=/')
    mockGetSession.mockResolvedValue({ headers, response: null })
    mockGetCookie.mockReturnValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockAppendResponseHeaders).toHaveBeenCalledWith(event, {
      'set-cookie': ['merp-session_token=; Max-Age=0; Path=/'],
    })
  })

  it('does not emit session_expired event for unauthorized (no cookie)', async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: null })
    mockGetCookie.mockReturnValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockCreateAuthEvent).not.toHaveBeenCalled()
  })

  it('does not log for unauthorized (no cookie)', async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: null })
    mockGetCookie.mockReturnValue(undefined)

    const handler = await import('~~/server/middleware/auth').then((m) => m.default)

    const event = { headers: new Headers(), context: {} } as any

    await expect(handler(event)).rejects.toThrow()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })
})
