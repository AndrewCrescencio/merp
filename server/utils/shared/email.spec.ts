import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '#shared/logger'
import {
  appVerificationLink,
  sendDeactivationNotice,
  sendPasswordResetLink,
  sendVerificationEmailLink,
} from './email'

const fetchMock = vi.fn()
const loggerErrorSpy = vi.spyOn(logger, 'error')
const loggerWarnSpy = vi.spyOn(logger, 'warn')

describe('sendDeactivationNotice', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('sends the deactivation notice via Resend with the correct payload', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    await sendDeactivationNotice('inactive@example.com')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer re_test_key', 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      from: 'no-reply@merp.example.com',
      to: 'inactive@example.com',
      subject: 'Your account has been deactivated',
    })
  })

  it('skips sending without RESEND_API_KEY/RESEND_FROM', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('RESEND_FROM', '')

    await sendDeactivationNotice('inactive@example.com')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(loggerWarnSpy).toHaveBeenCalled()
  })

  it('resolves (does not throw) when the Resend call fails', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')
    fetchMock.mockRejectedValue(new Error('network down'))

    await expect(sendDeactivationNotice('inactive@example.com')).resolves.toBeUndefined()
    expect(loggerErrorSpy).toHaveBeenCalled()
  })

  it('resolves (does not throw) when Resend rejects the request', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })

    await expect(sendDeactivationNotice('inactive@example.com')).resolves.toBeUndefined()
    expect(loggerErrorSpy).toHaveBeenCalled()
  })
})

describe('AUD-04 email link handling (better-auth URLs → app endpoints)', () => {
  it('verification link already points to /api/auth (basePath) and strips callbackURL', () => {
    const url = 'https://app.merp.com.br/api/auth/verify-email?token=abc&callbackURL=%2F'

    expect(appVerificationLink(url)).toBe('https://app.merp.com.br/api/auth/verify-email?token=abc')
  })
})

describe('AUD-04 transactional email senders', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('sendVerificationEmailLink sends the verification subject and link', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    await sendVerificationEmailLink('new@example.com', 'https://app/api/auth/verify-email?token=x')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      to: 'new@example.com',
      subject: 'Verify your email address',
    })
    expect(body.html).toContain('/api/auth/verify-email?token=x')
  })

  it('sendPasswordResetLink sends the reset subject and link', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    await sendPasswordResetLink('lost@example.com', 'https://app/api/auth/reset-password/tok1')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      to: 'lost@example.com',
      subject: 'Reset your password',
    })
    expect(body.html).toContain('/api/auth/reset-password/tok1')
  })
})
