import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockEvent, createAuthError } from '~~/server/utils/test-utils'

const mockSignIn = vi.fn()
const mockCreateAuthEvent = vi.fn().mockResolvedValue(undefined)
const mockCheckIpRateLimit = vi.fn()
const mockCheckEmailRateLimit = vi.fn()
const mockCheckAccountLockout = vi.fn()
const mockRecordFailedAttempt = vi.fn()
const mockResetFailedAttempts = vi.fn()
const mockSendValidationError = vi.fn()
const mockSendUnauthorizedError = vi.fn()
const mockSendAuthError = vi.fn()
const mockReadBody = vi.fn()
const mockGetClientIp = vi.fn()
const mockAppendResponseHeaders = vi.fn()
const mockSendDeactivationNotice = vi.fn()

vi.mock('h3', async (importOriginal) => ({
  ...(await importOriginal()),
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
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
vi.mock('~~/server/utils/auth/identity/queries', () => ({
  signInUser: mockSignIn,
}))
vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
  checkEmailRateLimit: mockCheckEmailRateLimit,
  checkAccountLockout: mockCheckAccountLockout,
  recordFailedAttempt: mockRecordFailedAttempt,
  resetFailedAttempts: mockResetFailedAttempts,
}))
vi.mock('~~/server/utils/shared/errors', async (importOriginal) => ({
  ...(await importOriginal()),
  sendValidationError: mockSendValidationError,
  sendUnauthorizedError: mockSendUnauthorizedError,
  sendAuthError: mockSendAuthError,
}))
vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))
vi.mock('~~/server/utils/shared/email', () => ({
  sendDeactivationNotice: mockSendDeactivationNotice,
}))

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockCheckEmailRateLimit.mockResolvedValue(undefined)
    mockCheckAccountLockout.mockResolvedValue(undefined)
    mockRecordFailedAttempt.mockResolvedValue(undefined)
    mockResetFailedAttempts.mockResolvedValue(undefined)
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendUnauthorizedError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendAuthError.mockImplementation((status: number, error: string, message: string) => {
      const err: any = new Error(JSON.stringify({ error, message }))
      err.status = status
      err.statusCode = status
      throw err
    })
  })

  it('validates email and password are required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Email and password are required')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('AUD-23: rejects non-string password with 400 instead of TypeError → 500', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 12345678 })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Email and password are required')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized email with generic 401 before any rate-limit key', async () => {
    mockReadBody.mockResolvedValue({
      email: `${'a'.repeat(300)}@example.com`,
      password: 'password123',
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockCheckEmailRateLimit).not.toHaveBeenCalled()
    expect(mockCheckAccountLockout).not.toHaveBeenCalled()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized password with generic 401', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'x'.repeat(1000),
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockCheckEmailRateLimit).not.toHaveBeenCalled()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('AUD-14: resetFailedAttempts failure does not fail a successful login', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })
    mockResetFailedAttempts.mockRejectedValue(new Error('db hiccup'))

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    const result = await handler(createMockEvent())

    expect(result).toEqual({ id: 'uuid', email: 'user@example.com', name: null })
    expect(mockCreateAuthEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'failed_login' }),
    )
  })

  it('checks IP rate limit before reading the body', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = createMockEvent()

    await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
  })

  it('returns 429 from IP rate limit without reading the body', async () => {
    mockCheckIpRateLimit.mockRejectedValue(
      createAuthError(429, 'rate_limit_exceeded', 'Too many requests'),
    )

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toMatchObject({ statusCode: 429 })
    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('calls checkEmailRateLimit with email', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = createMockEvent()

    await handler(event)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith(event, 'user@example.com')
  })

  it('normalizes mixed-case email across rate limit, lockout, signIn and reset', async () => {
    mockReadBody.mockResolvedValue({ email: '  User@Example.COM  ', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = createMockEvent({ headers: new Headers() })

    await handler(event)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith(event, 'user@example.com')
    expect(mockCheckAccountLockout).toHaveBeenCalledWith('user@example.com', null)
    expect(mockResetFailedAttempts).toHaveBeenCalledWith('user@example.com', null)
    expect(mockSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
      event.headers,
    )
  })

  it('records failed attempt with normalized email', async () => {
    mockReadBody.mockResolvedValue({ email: 'User@Example.COM', password: 'wrongpassword' })
    const authError = new Error('Invalid credentials')
    ;(authError as any).statusCode = 401
    mockSignIn.mockRejectedValue(authError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('user@example.com', null)
  })

  it('calls checkAccountLockout before authentication', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler(createMockEvent())

    expect(mockCheckAccountLockout).toHaveBeenCalledWith('user@example.com', null)
  })

  it('returns user data on successful login', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid-123', email: 'user@example.com', name: 'Test User' },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    const result = await handler(createMockEvent())

    expect(result).toEqual({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Test User',
    })
  })

  it('resets failed attempts on successful login', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler(createMockEvent())

    expect(mockResetFailedAttempts).toHaveBeenCalledWith('user@example.com', null)
  })

  it('returns 401 on invalid credentials and records failed attempt', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'wrongpassword' })
    const authError = new Error('Invalid credentials')
    ;(authError as any).statusCode = 401
    mockSignIn.mockRejectedValue(authError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('user@example.com', null)
  })

  it('passes rememberMe flag and headers to repository', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'password123',
      rememberMe: true,
    })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const headers = new Headers({ cookie: 'merp-session_token=abc' })
    const event = createMockEvent({ headers })

    await handler(event)

    expect(mockSignIn).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'password123', rememberMe: true },
      headers,
    )
  })

  it('defaults rememberMe to false', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    // Use an event without headers to match the original test expectation
    const event = {
      context: { user: undefined, session: undefined, tenantId: null, userId: null },
      headers: undefined,
    } as any
    await handler(event)

    expect(mockSignIn).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'password123', rememberMe: false },
      undefined,
    )
  })

  it('returns generic 401 when account is locked (anti-enumeration)', async () => {
    mockCheckAccountLockout.mockImplementationOnce(() => {
      throw createAuthError(
        401,
        'account_locked',
        'Account locked due to too many failed attempts. Please try again later.',
      )
    })
    mockGetClientIp.mockReturnValue('203.0.113.9')

    mockReadBody.mockResolvedValue({ email: 'locked@example.com', password: 'password123' })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockSignIn).not.toHaveBeenCalled()
    expect(mockCheckAccountLockout).toHaveBeenCalledWith('locked@example.com', '203.0.113.9')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'locked@example.com',
        eventType: 'failed_login',
        ipAddress: '203.0.113.9',
        metadata: { reason: 'account_locked' },
      }),
    )
  })

  it('does not reveal account_locked from the repository, keeps it internal', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'wrongpassword' })
    const lockedError = createAuthError(401, 'account_locked', 'Account locked')
    mockSignIn.mockRejectedValue(lockedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'failed_login',
        metadata: { reason: 'invalid_credentials' },
      }),
    )
  })

  it('masks account_deactivated, records it as the reason, and sends a deactivation notice email', async () => {
    mockReadBody.mockResolvedValue({ email: 'inactive@example.com', password: 'password123' })
    const deactivatedError = createAuthError(
      401,
      'account_deactivated',
      'User has been deactivated',
    )
    mockSignIn.mockRejectedValue(deactivatedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockSendUnauthorizedError).toHaveBeenCalled()
    expect(mockSendDeactivationNotice).toHaveBeenCalledWith('inactive@example.com')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'inactive@example.com',
        eventType: 'failed_login',
        metadata: { reason: 'account_deactivated' },
      }),
    )
  })

  it('forwards the session Set-Cookie from the repository to the client', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: ['merp-session_token=abc; Path=/; HttpOnly; SameSite=Lax'],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = createMockEvent({ headers: new Headers() })

    await handler(event)

    expect(mockAppendResponseHeaders).toHaveBeenCalledWith(event, {
      'set-cookie': ['merp-session_token=abc; Path=/; HttpOnly; SameSite=Lax'],
    })
  })

  it('does not forward headers when the repository returns no cookie', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      response: {
        user: { id: 'uuid', email: 'user@example.com', name: null },
        token: 'session-token',
      },
      headers: new Headers(),
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler(createMockEvent({ headers: new Headers() }))

    expect(mockAppendResponseHeaders).not.toHaveBeenCalled()
  })

  it('does not record a failed attempt for account_deactivated', async () => {
    mockReadBody.mockResolvedValue({ email: 'inactive@example.com', password: 'password123' })
    const deactivatedError = createAuthError(
      401,
      'account_deactivated',
      'User has been deactivated',
    )
    mockSignIn.mockRejectedValue(deactivatedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockRecordFailedAttempt).not.toHaveBeenCalled()
  })

  it('AUD-04: returns explicit 403 email_not_verified and records it as the reason', async () => {
    mockReadBody.mockResolvedValue({ email: 'unverified@example.com', password: 'password123' })
    const notVerifiedError = createAuthError(403, 'email_not_verified', 'Email not verified')
    mockSignIn.mockRejectedValue(notVerifiedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toMatchObject({ statusCode: 403 })
    expect(mockSendAuthError).toHaveBeenCalledWith(
      403,
      'email_not_verified',
      'Please verify your email address before logging in.',
    )
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'unverified@example.com',
        eventType: 'failed_login',
        metadata: { reason: 'email_not_verified' },
      }),
    )
  })

  it('AUD-04: does not record a failed attempt or send a notice for email_not_verified', async () => {
    mockReadBody.mockResolvedValue({ email: 'unverified@example.com', password: 'password123' })
    const notVerifiedError = createAuthError(403, 'email_not_verified', 'Email not verified')
    mockSignIn.mockRejectedValue(notVerifiedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toMatchObject({ statusCode: 403 })
    expect(mockRecordFailedAttempt).not.toHaveBeenCalled()
    expect(mockSendDeactivationNotice).not.toHaveBeenCalled()
  })

  it('does not record a failed attempt on infrastructure errors (503/500)', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    const upstreamError = createAuthError(503, 'upstream_timeout', 'upstream timeout')
    mockSignIn.mockRejectedValue(upstreamError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toMatchObject({ statusCode: 503 })
    expect(mockRecordFailedAttempt).not.toHaveBeenCalled()
  })

  it('keeps generic unauthorized for 401 errors without a specific code', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'wrongpassword' })
    const genericError = createAuthError(401, 'unauthorized', 'nope')
    mockSignIn.mockRejectedValue(genericError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler(createMockEvent())).rejects.toThrow('Invalid email or password')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'failed_login',
        metadata: { reason: 'invalid_credentials' },
      }),
    )
  })
})
