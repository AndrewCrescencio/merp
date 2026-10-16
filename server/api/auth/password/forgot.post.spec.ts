import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRequestPasswordReset = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockCheckEmailRateLimit = vi.fn()
const mockEnforceMinimumTime = vi.fn()
const mockSendValidationError = vi.fn()
const mockReadBody = vi.fn()

vi.mock('h3', async (importOriginal) => ({
  ...(await importOriginal()),
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
}))

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
  checkEmailRateLimit: mockCheckEmailRateLimit,
  enforceMinimumTime: mockEnforceMinimumTime,
}))

vi.mock('~~/server/utils/shared/errors', async (importOriginal) => ({
  ...(await importOriginal()),
  sendValidationError: mockSendValidationError,
}))

vi.mock('~~/server/utils/auth/identity/queries', () => ({
  requestPasswordResetBA: mockRequestPasswordReset,
}))

describe('POST /api/auth/password/forgot (AUD-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockCheckEmailRateLimit.mockResolvedValue(undefined)
    mockEnforceMinimumTime.mockResolvedValue(undefined)
    mockRequestPasswordReset.mockResolvedValue(undefined)
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('checks IP rate limit before reading the body', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com' })
    const handler = await import('~~/server/api/auth/password/forgot.post').then((m) => m.default)
    const event = {} as any

    await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
  })

  it('validates email format', async () => {
    mockReadBody.mockResolvedValue({ email: 'not-an-email' })

    const handler = await import('~~/server/api/auth/password/forgot.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Valid email is required')
    expect(mockRequestPasswordReset).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized email before the rate-limit key', async () => {
    mockReadBody.mockResolvedValue({ email: `${'a'.repeat(300)}@example.com` })

    const handler = await import('~~/server/api/auth/password/forgot.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Valid email is required')
    expect(mockCheckEmailRateLimit).not.toHaveBeenCalled()
    expect(mockRequestPasswordReset).not.toHaveBeenCalled()
  })

  it('checks the per-email rate limit and delegates with the normalized email', async () => {
    mockReadBody.mockResolvedValue({ email: 'USER@Example.com ' })

    const handler = await import('~~/server/api/auth/password/forgot.post').then((m) => m.default)

    const result = await handler({} as any)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith({} as any, 'user@example.com')
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('user@example.com')
    expect(result).toEqual({
      status: true,
      message: 'If this email exists in our system, check your email for the reset link',
    })
  })

  it('returns the generic message for unknown emails (anti-enumeration)', async () => {
    mockReadBody.mockResolvedValue({ email: 'unknown@example.com' })

    const handler = await import('~~/server/api/auth/password/forgot.post').then((m) => m.default)

    const result = await handler({} as any)

    expect(result.status).toBe(true)
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('unknown@example.com')
  })

  it('propagates upstream errors', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com' })
    const upstream: any = new Error('db down')
    upstream.statusCode = 503
    mockRequestPasswordReset.mockRejectedValue(upstream)

    const handler = await import('~~/server/api/auth/password/forgot.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
    // Sem piso: o erro já respondeu antes — não há timing a equalizar.
    expect(mockEnforceMinimumTime).not.toHaveBeenCalled()
  })

  it('AUD-04: enforces a minimum response time before answering', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com' })

    const handler = await import('~~/server/api/auth/password/forgot.post').then((m) => m.default)
    await handler({} as any)

    expect(mockEnforceMinimumTime).toHaveBeenCalledTimes(1)
    const [start, minimumMs] = mockEnforceMinimumTime.mock.calls[0] ?? []
    expect(typeof start).toBe('number')
    // Precisa cobrir o pior caso do envio (Resend limitado a 450ms + banco).
    expect(minimumMs).toBeGreaterThanOrEqual(500)
  })
})
