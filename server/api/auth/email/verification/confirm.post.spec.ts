import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVerifyEmailBA = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockSendValidationError = vi.fn()
const mockReadBody = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
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

describe('POST /api/auth/email/verification/confirm (AUD-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockVerifyEmailBA.mockResolvedValue(undefined)
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('rejects requests without a token', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/email/verification/confirm.post').then(
      (m) => m.default,
    )

    await expect(handler({} as any)).rejects.toThrow('Invalid or expired verification link')
    expect(mockVerifyEmailBA).not.toHaveBeenCalled()
  })

  it('delegates the token to the repository and returns generic success', async () => {
    mockReadBody.mockResolvedValue({ token: 'signed-jwt' })

    const handler = await import('~~/server/api/auth/email/verification/confirm.post').then(
      (m) => m.default,
    )
    const event = {} as any

    const result = await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
    expect(mockVerifyEmailBA).toHaveBeenCalledWith('signed-jwt')
    expect(result).toEqual({ status: true })
  })

  it('propagates validation errors from the repository (invalid/expired token)', async () => {
    mockReadBody.mockResolvedValue({ token: 'bogus' })
    mockVerifyEmailBA.mockRejectedValue(new Error('Invalid or expired verification link'))

    const handler = await import('~~/server/api/auth/email/verification/confirm.post').then(
      (m) => m.default,
    )

    await expect(handler({} as any)).rejects.toThrow('Invalid or expired verification link')
  })
})
