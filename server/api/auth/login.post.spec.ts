import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSignIn = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockCheckEmailRateLimit = vi.fn()
const mockCheckAccountLockout = vi.fn()
const mockRecordFailedAttempt = vi.fn()
const mockResetFailedAttempts = vi.fn()
const mockSendValidationError = vi.fn()
const mockSendUnauthorizedError = vi.fn()
const mockReadBody = vi.fn()
const mockGetClientIp = vi.fn()
const mockAppendResponseHeaders = vi.fn()

vi.mock('h3', () => ({
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

vi.mock('~~/server/utils/auth/identity/repository', () => ({
  identityRepository: { signIn: mockSignIn },
}))

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
  checkEmailRateLimit: mockCheckEmailRateLimit,
  checkAccountLockout: mockCheckAccountLockout,
  recordFailedAttempt: mockRecordFailedAttempt,
  resetFailedAttempts: mockResetFailedAttempts,
}))

vi.mock('~~/server/utils/shared/errors', () => ({
  sendValidationError: mockSendValidationError,
  sendUnauthorizedError: mockSendUnauthorizedError,
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
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
  })

  it('validates email and password are required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Email and password are required')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('checks IP rate limit before reading the body', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = {} as any

    await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
  })

  it('returns 429 from IP rate limit without reading the body', async () => {
    const ipError: any = new Error(
      JSON.stringify({
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Try again later.',
        retryAfter: 30,
      }),
    )
    ipError.status = 429
    ipError.statusCode = 429
    mockCheckIpRateLimit.mockRejectedValue(ipError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 429 })
    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('calls checkEmailRateLimit with email', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = {} as any

    await handler(event)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith(event, 'user@example.com')
  })

  it('normalizes mixed-case email across rate limit, lockout, signIn and reset', async () => {
    mockReadBody.mockResolvedValue({ email: '  User@Example.COM  ', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = { headers: new Headers() } as any

    await handler(event)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith(event, 'user@example.com')
    expect(mockCheckAccountLockout).toHaveBeenCalledWith('user@example.com')
    expect(mockResetFailedAttempts).toHaveBeenCalledWith('user@example.com')
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

    await expect(handler({} as any)).rejects.toThrow('Invalid email or password')
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('user@example.com')
  })

  it('calls checkAccountLockout before authentication', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler({} as any)

    expect(mockCheckAccountLockout).toHaveBeenCalledWith('user@example.com')
  })

  it('returns user data on successful login', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Test User',
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toEqual({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Test User',
    })
  })

  it('resets failed attempts on successful login', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler({} as any)

    expect(mockResetFailedAttempts).toHaveBeenCalledWith('user@example.com')
  })

  it('returns 401 on invalid credentials and records failed attempt', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'wrongpassword' })
    const authError = new Error('Invalid credentials')
    ;(authError as any).statusCode = 401
    mockSignIn.mockRejectedValue(authError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid email or password')
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('user@example.com')
  })

  it('passes rememberMe flag and headers to repository', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'password123',
      rememberMe: true,
    })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const headers = new Headers({ cookie: 'merp-session_token=abc' })
    const event = { headers } as any

    await handler(event)

    expect(mockSignIn).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'password123', rememberMe: true },
      headers,
    )
  })

  it('defaults rememberMe to false', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler({} as any)

    expect(mockSignIn).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'password123', rememberMe: false },
      undefined,
    )
  })

  it('returns generic 401 when account is locked (anti-enumeration)', async () => {
    mockCheckAccountLockout.mockImplementationOnce(() => {
      const err: any = new Error(
        JSON.stringify({
          error: 'account_locked',
          message: 'Account locked due to too many failed attempts. Please try again later.',
        }),
      )
      err.status = 401
      err.statusCode = 401
      throw err
    })
    mockGetClientIp.mockReturnValue('203.0.113.9')

    mockReadBody.mockResolvedValue({ email: 'locked@example.com', password: 'password123' })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid email or password')
    expect(mockSignIn).not.toHaveBeenCalled()
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
    const lockedError: any = new Error(
      JSON.stringify({ error: 'account_locked', message: 'Account locked' }),
    )
    lockedError.statusCode = 401
    mockSignIn.mockRejectedValue(lockedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid email or password')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'failed_login',
        metadata: { reason: 'invalid_credentials' },
      }),
    )
  })

  it('repasses account_deactivated error and records it as the failed_login reason', async () => {
    mockReadBody.mockResolvedValue({ email: 'inactive@example.com', password: 'password123' })
    const deactivatedError: any = new Error(
      JSON.stringify({ error: 'account_deactivated', message: 'User has been deactivated' }),
    )
    deactivatedError.statusCode = 401
    mockSignIn.mockRejectedValue(deactivatedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('account_deactivated'),
    })
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'inactive@example.com',
        eventType: 'failed_login',
        metadata: { reason: 'account_deactivated' },
      }),
    )
    expect(mockSendUnauthorizedError).not.toHaveBeenCalled()
  })

  it('forwards the session Set-Cookie from the repository to the client', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: ['merp-session_token=abc; Path=/; HttpOnly; SameSite=Lax'],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = { headers: new Headers() } as any

    await handler(event)

    expect(mockAppendResponseHeaders).toHaveBeenCalledWith(event, {
      'set-cookie': ['merp-session_token=abc; Path=/; HttpOnly; SameSite=Lax'],
    })
  })

  it('does not forward headers when the repository returns no cookie', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: null,
      setCookie: [],
    })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler({ headers: new Headers() } as any)

    expect(mockAppendResponseHeaders).not.toHaveBeenCalled()
  })

  it('does not record a failed attempt for account_deactivated', async () => {
    mockReadBody.mockResolvedValue({ email: 'inactive@example.com', password: 'password123' })
    const deactivatedError: any = new Error(
      JSON.stringify({ error: 'account_deactivated', message: 'User has been deactivated' }),
    )
    deactivatedError.statusCode = 401
    mockSignIn.mockRejectedValue(deactivatedError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockRecordFailedAttempt).not.toHaveBeenCalled()
  })

  it('does not record a failed attempt on infrastructure errors (503/500)', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    const upstreamError: any = new Error('upstream timeout')
    upstreamError.statusCode = 503
    mockSignIn.mockRejectedValue(upstreamError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(mockRecordFailedAttempt).not.toHaveBeenCalled()
  })

  it('keeps generic unauthorized for 401 errors without a specific code', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'wrongpassword' })
    const genericError: any = new Error(JSON.stringify({ error: 'unauthorized', message: 'nope' }))
    genericError.statusCode = 401
    mockSignIn.mockRejectedValue(genericError)

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid email or password')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'failed_login',
        metadata: { reason: 'invalid_credentials' },
      }),
    )
  })
})
