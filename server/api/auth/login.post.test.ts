import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSignIn = vi.fn()
const mockCheckRateLimit = vi.fn()
const mockCheckAccountLockout = vi.fn()
const mockRecordFailedAttempt = vi.fn()
const mockResetFailedAttempts = vi.fn()
const mockSendValidationError = vi.fn()
const mockSendUnauthorizedError = vi.fn()
const mockReadBody = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/repository', () => ({
  authRepository: { signIn: mockSignIn },
}))

vi.mock('~~/server/utils/auth/helpers', () => ({
  checkRateLimit: mockCheckRateLimit,
  checkAccountLockout: mockCheckAccountLockout,
  recordFailedAttempt: mockRecordFailedAttempt,
  resetFailedAttempts: mockResetFailedAttempts,
  sendValidationError: mockSendValidationError,
  sendUnauthorizedError: mockSendUnauthorizedError,
}))

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('calls checkRateLimit with email', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({ id: 'uuid', email: 'user@example.com', name: null })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)
    const event = {} as any

    await handler(event)

    expect(mockCheckRateLimit).toHaveBeenCalledWith(event, 'user@example.com')
  })

  it('calls checkAccountLockout before authentication', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({ id: 'uuid', email: 'user@example.com', name: null })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler({} as any)

    expect(mockCheckAccountLockout).toHaveBeenCalledWith('user@example.com')
  })

  it('returns user data on successful login', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'password123' })
    mockSignIn.mockResolvedValue({ id: 'uuid-123', email: 'user@example.com', name: 'Test User' })

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
    mockSignIn.mockResolvedValue({ id: 'uuid', email: 'user@example.com', name: null })

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
    mockSignIn.mockResolvedValue({ id: 'uuid', email: 'user@example.com', name: null })

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
    mockSignIn.mockResolvedValue({ id: 'uuid', email: 'user@example.com', name: null })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await handler({} as any)

    expect(mockSignIn).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'password123', rememberMe: false },
      undefined,
    )
  })

  it('returns 401 lockout error when account is locked', async () => {
    mockCheckAccountLockout.mockImplementation(() => {
      const err: any = new Error('Account locked')
      err.status = 401
      throw err
    })

    mockReadBody.mockResolvedValue({ email: 'locked@example.com', password: 'password123' })

    const handler = await import('~~/server/api/auth/login.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow()
    expect(mockSignIn).not.toHaveBeenCalled()
  })
})
