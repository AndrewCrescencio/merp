import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRegister = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockCheckEmailRateLimit = vi.fn()
const mockSendValidationError = vi.fn()
const mockSetResponseStatus = vi.fn()
const mockReadBody = vi.fn()
const mockGetClientIp = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
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
  identityRepository: { register: mockRegister },
  generateUserId: () => 'synthetic-user-id-123',
}))

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
  checkEmailRateLimit: mockCheckEmailRateLimit,
}))

vi.mock('~~/server/utils/shared/errors', () => ({
  sendValidationError: mockSendValidationError,
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

vi.mock('#shared/auth', () => ({
  auth: { api: {} },
}))

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockCheckEmailRateLimit.mockResolvedValue(undefined)
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('validates email is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Valid email is required')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('validates email format', async () => {
    mockReadBody.mockResolvedValue({ email: 'invalid', password: 'Str0ngP@ssw0rd!2026' })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Valid email is required')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('validates password minimum length', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: '123' })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Password must be at least 8 characters')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('rejects common/breached passwords (deny-list)', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'password123',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow(
      'Password is too common. Choose a stronger password.',
    )
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized email', async () => {
    mockReadBody.mockResolvedValue({
      email: `${'a'.repeat(300)}@example.com`,
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Valid email is required')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized password', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'x'.repeat(1000),
      name: 'Test User',
      consentTermsVersion: 'v1',
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Password must be at most 128 characters')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized name', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'x'.repeat(200),
      consentTermsVersion: 'v1',
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Name must be at most 120 characters')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized consentTermsVersion', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v'.repeat(100),
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow(
      'consentTermsVersion must be at most 50 characters',
    )
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('validates name is required', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com', password: 'Str0ngP@ssw0rd!2026' })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Name is required')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('validates name is not empty', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: '',
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Name is required')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('AUD-13: rejects registration without consentTermsVersion', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('consentTermsVersion is required')
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('checks IP rate limit before reading the body', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })
    mockRegister.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: 'Test User',
      createdAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)
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

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 429 })
    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('calls checkEmailRateLimit with email', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })
    mockRegister.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: 'Test User',
      createdAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)
    const event = {} as any

    await handler(event)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith(event, 'user@example.com')
  })

  it('normalizes mixed-case email before rate limit and registration', async () => {
    mockReadBody.mockResolvedValue({
      email: '  User@Example.COM  ',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })
    mockRegister.mockResolvedValue({
      id: 'uuid',
      email: 'user@example.com',
      name: 'Test User',
      createdAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)
    const event = {} as any

    await handler(event)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith(event, 'user@example.com')
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    )
  })

  it('returns 201 with user data on successful registration', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })
    const createdAt = new Date('2026-01-01')
    mockRegister.mockResolvedValue({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Test User',
      createdAt,
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toEqual({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Test User',
      createdAt,
    })
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 201)
    expect(mockCreateAuthEvent).toHaveBeenCalled()
  })

  it('AUD-03: returns identical 201 response when email already registered', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })
    mockRegister.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)
    const result = await handler({} as any)

    expect(result).toEqual({
      id: expect.any(String),
      email: 'user@example.com',
      name: 'Test User',
      createdAt: expect.any(Date),
    })
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 201)
    expect(mockCreateAuthEvent).not.toHaveBeenCalled()
  })

  it('registers with name', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Alice',
      consentTermsVersion: 'v1',
    })
    const createdAt = new Date('2026-01-01')
    mockRegister.mockResolvedValue({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Alice',
      createdAt,
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)

    const result = await handler({} as any)

    expect(mockRegister).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Alice',
      consentTermsVersion: 'v1',
    })
    expect(result).toHaveProperty('name', 'Alice')
  })

  it('trims whitespace from name', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Alice',
      consentTermsVersion: 'v1',
    })
    mockRegister.mockResolvedValue({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Alice',
      createdAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)
    await handler({} as any)

    expect(mockRegister).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Alice',
      consentTermsVersion: 'v1',
    })
  })

  it('passes consentTermsVersion to repository when provided', async () => {
    mockReadBody.mockResolvedValue({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })
    const createdAt = new Date('2026-01-01')
    mockRegister.mockResolvedValue({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Test User',
      createdAt,
    })

    const handler = await import('~~/server/api/auth/register.post').then((m) => m.default)
    await handler({} as any)

    expect(mockRegister).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'Str0ngP@ssw0rd!2026',
      name: 'Test User',
      consentTermsVersion: 'v1',
    })
  })
})
