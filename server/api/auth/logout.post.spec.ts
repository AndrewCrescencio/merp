import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuth = vi.fn()
const mockSignOut = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockSendUnauthorizedError = vi.fn()
const mockSendAuthUnavailableError = vi.fn()
const mockGetClientIp = vi.fn()
const mockAppendResponseHeaders = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  appendResponseHeaders: mockAppendResponseHeaders,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))
vi.mock('~~/server/utils/shared/ip', () => ({
  getClientIp: mockGetClientIp,
}))

vi.mock('#shared/auth', () => ({
  getAuth: mockGetAuth,
}))

vi.mock('~~/server/utils/shared/errors', () => ({
  sendUnauthorizedError: mockSendUnauthorizedError,
  sendAuthUnavailableError: mockSendAuthUnavailableError,
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuth.mockResolvedValue({ api: { signOut: mockSignOut } })
    mockSendUnauthorizedError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendAuthUnavailableError.mockImplementation(() => {
      throw new Error('Authentication service is starting. Please try again.')
    })
  })

  it('returns 200 with success message on logout', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)
    mockSignOut.mockResolvedValue({ headers: new Headers(), response: { success: true } })

    const event = {
      context: {
        session: { id: 'session-123' },
      },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result).toEqual({ message: 'Logged out successfully' })
    expect(mockSignOut).toHaveBeenCalledWith({
      headers: event.headers,
      returnHeaders: true,
    })
  })

  it('forwards the session-expiry Set-Cookie from signOut', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)
    const headers = new Headers()
    headers.append('set-cookie', 'merp-session_token=; Max-Age=0; Path=/')
    mockSignOut.mockResolvedValue({ headers, response: { success: true } })

    const event = {
      context: { session: { id: 'session-123' } },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockAppendResponseHeaders).toHaveBeenCalledWith(event, {
      'set-cookie': ['merp-session_token=; Max-Age=0; Path=/'],
    })
  })

  it('returns 401 when no active session exists', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)

    const event = {
      context: {},
      headers: new Headers(),
    } as any

    await expect(handler(event)).rejects.toThrow('No active session.')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('returns 401 when session is undefined', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)

    const event = {
      context: { session: undefined },
      headers: new Headers(),
    } as any

    await expect(handler(event)).rejects.toThrow('No active session.')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('calls signOut with event headers', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)
    mockSignOut.mockResolvedValue({ headers: new Headers(), response: { success: true } })

    const headers = new Headers({ cookie: 'merp-session_token=abc123' })
    const event = {
      context: { session: { id: 'session-123' } },
      headers,
    } as any

    await handler(event)

    expect(mockSignOut).toHaveBeenCalledWith({ headers, returnHeaders: true })
  })

  it('emits session_invalidated event with sessionId on logout', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)
    mockSignOut.mockResolvedValue({ headers: new Headers(), response: { success: true } })

    const event = {
      context: {
        session: { id: 'session-123', activeCompanyId: 'company-1' },
        user: { id: 'user-1', email: 'user@example.com' },
      },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'session_invalidated',
      ipAddress: null,
      metadata: {
        sessionId: 'session-123',
        userId: 'user-1',
      },
    })
  })

  it('emits session_invalidated with unknown user when context user is missing', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)
    mockSignOut.mockResolvedValue({ headers: new Headers(), response: { success: true } })

    const event = {
      context: {
        session: { id: 'session-123' },
      },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'unknown',
        eventType: 'session_invalidated',
        metadata: expect.objectContaining({ sessionId: 'session-123' }),
      }),
    )
  })
})
