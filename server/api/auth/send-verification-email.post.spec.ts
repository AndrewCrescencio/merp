import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendVerificationEmail = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockCheckEmailRateLimit = vi.fn()
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
}))

vi.mock('~~/server/utils/shared/errors', async (importOriginal) => ({
  ...(await importOriginal()),
  sendValidationError: mockSendValidationError,
}))

vi.mock('~~/server/utils/auth/identity/queries', () => ({
  sendVerificationEmailBA: mockSendVerificationEmail,
}))

describe('POST /api/auth/send-verification-email (AUD-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockCheckEmailRateLimit.mockResolvedValue(undefined)
    mockSendVerificationEmail.mockResolvedValue(undefined)
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('checks IP rate limit before reading the body', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com' })
    const handler = await import('~~/server/api/auth/send-verification-email.post').then(
      (m) => m.default,
    )
    const event = {} as any

    await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
  })

  it('validates email format', async () => {
    mockReadBody.mockResolvedValue({ email: 'not-an-email' })

    const handler = await import('~~/server/api/auth/send-verification-email.post').then(
      (m) => m.default,
    )

    await expect(handler({} as any)).rejects.toThrow('Valid email is required')
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized email before the rate-limit key', async () => {
    mockReadBody.mockResolvedValue({ email: `${'a'.repeat(300)}@example.com` })

    const handler = await import('~~/server/api/auth/send-verification-email.post').then(
      (m) => m.default,
    )

    await expect(handler({} as any)).rejects.toThrow('Valid email is required')
    expect(mockCheckEmailRateLimit).not.toHaveBeenCalled()
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('checks the per-email rate limit before delegating', async () => {
    mockReadBody.mockResolvedValue({ email: 'USER@Example.com ' })

    const handler = await import('~~/server/api/auth/send-verification-email.post').then(
      (m) => m.default,
    )

    const result = await handler({} as any)

    expect(mockCheckEmailRateLimit).toHaveBeenCalledWith({} as any, 'user@example.com')
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('user@example.com')
    expect(result).toEqual({ status: true })
  })

  it('returns generic success regardless of whether the account exists (anti-enumeration)', async () => {
    mockReadBody.mockResolvedValue({ email: 'unknown@example.com' })

    const handler = await import('~~/server/api/auth/send-verification-email.post').then(
      (m) => m.default,
    )

    const result = await handler({} as any)

    expect(result).toEqual({ status: true })
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('unknown@example.com')
  })

  it('propagates upstream errors', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com' })
    const upstream: any = new Error('db down')
    upstream.statusCode = 503
    mockSendVerificationEmail.mockRejectedValue(upstream)

    const handler = await import('~~/server/api/auth/send-verification-email.post').then(
      (m) => m.default,
    )

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
  })
})
