import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

const mockValidateResetToken = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockSendRedirect = vi.fn()
const mockGetRouterParam = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRouterParam: mockGetRouterParam,
  sendRedirect: mockSendRedirect,
}))

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
}))

vi.mock('~~/server/utils/auth/identity/repository', () => ({
  identityRepository: { validateResetToken: mockValidateResetToken },
}))

describe('GET /api/auth/reset-password/[token] (AUD-04/AUD-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockSendRedirect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('redirects with the token to the app origin when the token is valid', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.merp.com.br')
    mockGetRouterParam.mockReturnValue('reset-token')
    mockValidateResetToken.mockResolvedValue(true)

    const handler = await import('~~/server/api/auth/reset-password/[token].get').then(
      (m) => m.default,
    )
    const event = {} as any

    await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
    expect(mockValidateResetToken).toHaveBeenCalledWith('reset-token')
    expect(mockSendRedirect).toHaveBeenCalledWith(
      event,
      'https://app.merp.com.br/?token=reset-token',
      302,
    )
  })

  it('redirects with error=INVALID_TOKEN when the token is invalid or expired', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.merp.com.br')
    mockGetRouterParam.mockReturnValue('stale-token')
    mockValidateResetToken.mockResolvedValue(false)

    const handler = await import('~~/server/api/auth/reset-password/[token].get').then(
      (m) => m.default,
    )

    await handler({} as any)

    expect(mockSendRedirect).toHaveBeenCalledWith(
      {} as any,
      'https://app.merp.com.br/?error=INVALID_TOKEN',
      302,
    )
  })

  it('AUD-08: ignores any callbackURL in the query (destination is server-config only)', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.merp.com.br')
    mockGetRouterParam.mockReturnValue('reset-token')
    mockValidateResetToken.mockResolvedValue(true)

    const handler = await import('~~/server/api/auth/reset-password/[token].get').then(
      (m) => m.default,
    )

    await handler({} as any)

    expect(mockSendRedirect).toHaveBeenCalledWith(
      {} as any,
      'https://app.merp.com.br/?token=reset-token',
      302,
    )
  })

  it('falls back to the default origin when BETTER_AUTH_URL is unset', async () => {
    mockGetRouterParam.mockReturnValue('reset-token')
    mockValidateResetToken.mockResolvedValue(true)

    const handler = await import('~~/server/api/auth/reset-password/[token].get').then(
      (m) => m.default,
    )

    await handler({} as any)

    expect(mockSendRedirect).toHaveBeenCalledWith(
      {} as any,
      'http://localhost:3000/?token=reset-token',
      302,
    )
  })
})
