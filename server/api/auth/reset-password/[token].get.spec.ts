import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

const mockValidateResetToken = vi.fn()
const mockCheckIpRateLimit = vi.fn()
const mockSendRedirect = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetQuery = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRouterParam: mockGetRouterParam,
  getQuery: mockGetQuery,
  sendRedirect: mockSendRedirect,
}))

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
}))

vi.mock('~~/server/utils/auth/identity/repository', () => ({
  identityRepository: { validateResetToken: mockValidateResetToken },
}))

describe('GET /api/auth/reset-password/[token] (AUD-04)', () => {
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
    mockGetQuery.mockReturnValue({ callbackURL: 'https://app.merp.com.br' })
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
    mockGetQuery.mockReturnValue({ callbackURL: 'https://app.merp.com.br' })
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

  it('uses only the origin of the callbackURL (never an arbitrary path)', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.merp.com.br')
    mockGetRouterParam.mockReturnValue('reset-token')
    mockGetQuery.mockReturnValue({ callbackURL: 'https://app.merp.com.br/reset?x=1' })
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

  it('falls back to BETTER_AUTH_URL when no callbackURL is present', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.merp.com.br')
    mockGetRouterParam.mockReturnValue('reset-token')
    mockGetQuery.mockReturnValue({})
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

  it('rejects a callbackURL from a foreign origin (anti-open-redirect)', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.merp.com.br')
    mockGetRouterParam.mockReturnValue('reset-token')
    mockGetQuery.mockReturnValue({ callbackURL: 'https://evil.example.com/phish' })
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

  it('accepts a callbackURL matching CORS_ORIGIN', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://api.merp.com.br')
    vi.stubEnv('CORS_ORIGIN', 'https://app.merp.com.br')
    mockGetRouterParam.mockReturnValue('reset-token')
    mockGetQuery.mockReturnValue({ callbackURL: 'https://app.merp.com.br/reset' })
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
})
