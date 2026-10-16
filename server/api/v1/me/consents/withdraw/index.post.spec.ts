import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWithdrawConsent = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockGetClientIp = vi.fn()
const mockReadBody = vi.fn().mockResolvedValue({})

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
vi.mock('~~/server/utils/shared/ip', () => ({
  getClientIp: mockGetClientIp,
}))

vi.mock('~~/server/utils/auth/identity/queries', () => ({
  withdrawConsent: mockWithdrawConsent,
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

describe('POST /api/v1/me/consents/withdraw', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({})
  })

  it('withdraws consent and returns success', async () => {
    mockWithdrawConsent.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: false,
      consentWithdrawnAt: new Date('2026-08-02T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const handler = await import('~~/server/api/v1/me/consents/withdraw/index.post').then(
      (m) => m.default,
    )

    const event = {
      context: { user: { id: 'user-1', email: 'user@example.com' } },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result).toEqual({ message: 'Consent withdrawn successfully' })
    expect(mockWithdrawConsent).toHaveBeenCalledWith('user-1')
  })

  it('logs consent_withdrawal event with consentWithdrawnAt metadata', async () => {
    const withdrawnAt = new Date('2026-08-02T12:00:00Z')
    mockWithdrawConsent.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: false,
      consentWithdrawnAt: withdrawnAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const handler = await import('~~/server/api/v1/me/consents/withdraw/index.post').then(
      (m) => m.default,
    )

    const event = {
      context: { user: { id: 'user-1', email: 'user@example.com' } },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'consent_withdrawal',
      ipAddress: null,
      metadata: {
        consentWithdrawnAt: withdrawnAt,
      },
    })
  })

  it('throws 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/v1/me/consents/withdraw/index.post').then(
      (m) => m.default,
    )

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockWithdrawConsent).not.toHaveBeenCalled()
  })
})
