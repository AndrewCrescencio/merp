import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVerifyEmailBA = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockSendValidationError = vi.fn()
const mockGetQuery = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getQuery: mockGetQuery,
}))

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
}))

vi.mock('~~/server/utils/shared/errors', () => ({
  sendValidationError: mockSendValidationError,
}))

vi.mock('~~/server/utils/auth/identity/queries', () => ({
  verifyEmailBA: mockVerifyEmailBA,
}))

describe('GET /api/auth/verify-email (AUD-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockVerifyEmailBA.mockResolvedValue(undefined)
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('rejects requests without a token', async () => {
    mockGetQuery.mockReturnValue({})

    const handler = await import('~~/server/api/auth/verify-email.get').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid or expired verification link')
    expect(mockVerifyEmailBA).not.toHaveBeenCalled()
  })

  it('delegates the token to the repository and returns generic success', async () => {
    mockGetQuery.mockReturnValue({ token: 'signed-jwt' })

    const handler = await import('~~/server/api/auth/verify-email.get').then((m) => m.default)
    const event = {} as any

    const result = await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
    expect(mockVerifyEmailBA).toHaveBeenCalledWith('signed-jwt')
    expect(result).toEqual({ status: true })
  })

  it('propagates validation errors from the repository (invalid/expired token)', async () => {
    mockGetQuery.mockReturnValue({ token: 'bogus' })
    mockVerifyEmailBA.mockRejectedValue(new Error('Invalid or expired verification link'))

    const handler = await import('~~/server/api/auth/verify-email.get').then((m) => m.default)

    await expect(handler({} as any)).rejects.toThrow('Invalid or expired verification link')
  })
})
