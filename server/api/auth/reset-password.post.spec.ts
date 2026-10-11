import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResetPassword = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockSendValidationError = vi.fn()
const mockReadBody = vi.fn()
const mockGetQuery = vi.fn()

vi.mock('h3', async (importOriginal) => ({
  ...(await importOriginal()),
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  getQuery: mockGetQuery,
}))

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
}))

vi.mock('~~/server/utils/shared/errors', async (importOriginal) => ({
  ...(await importOriginal()),
  sendValidationError: mockSendValidationError,
}))

vi.mock('~~/server/utils/auth/identity/queries', () => ({
  resetPasswordBA: mockResetPassword,
}))

describe('POST /api/auth/reset-password (AUD-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockResetPassword.mockResolvedValue(undefined)
    mockGetQuery.mockReturnValue({})
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('checks IP rate limit before reading the body', async () => {
    mockReadBody.mockResolvedValue({ token: 'reset-token', newPassword: 'new-password-123' })
    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)
    const event = {} as any

    await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
  })

  it('rejects passwords shorter than 8 characters', async () => {
    mockReadBody.mockResolvedValue({ token: 'reset-token', newPassword: 'short' })

    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Password must be at least 8 characters')
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized passwords before delegating', async () => {
    mockReadBody.mockResolvedValue({ token: 'reset-token', newPassword: 'x'.repeat(1000) })

    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Password must be at most 128 characters')
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('rejects common/breached passwords (deny-list)', async () => {
    mockReadBody.mockResolvedValue({ token: 'reset-token', newPassword: 'password' })

    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow(
      'Password is too common. Choose a stronger password.',
    )
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('rejects requests without a token', async () => {
    mockReadBody.mockResolvedValue({ newPassword: 'new-password-123' })
    mockGetQuery.mockReturnValue({})

    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid or expired reset link')
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('delegates token from body and returns generic success', async () => {
    mockReadBody.mockResolvedValue({ token: 'reset-token', newPassword: 'new-password-123' })

    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)

    const result = await handler({} as any)

    expect(mockResetPassword).toHaveBeenCalledWith('reset-token', 'new-password-123')
    expect(result).toEqual({ status: true })
  })

  it('accepts the token from the query string (better-auth client convention)', async () => {
    mockReadBody.mockResolvedValue({ newPassword: 'new-password-123' })
    mockGetQuery.mockReturnValue({ token: 'query-token' })

    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)

    await handler({} as any)

    expect(mockResetPassword).toHaveBeenCalledWith('query-token', 'new-password-123')
  })

  it('propagates validation errors from the repository (invalid/consumed/expired token)', async () => {
    mockReadBody.mockResolvedValue({ token: 'bogus', newPassword: 'new-password-123' })
    mockResetPassword.mockRejectedValue(new Error('Invalid or expired reset link'))

    const handler = await import('~~/server/api/auth/reset-password.post').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid or expired reset link')
  })
})
