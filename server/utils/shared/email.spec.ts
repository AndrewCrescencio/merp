import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '#shared/logger'
import { sendDeactivationNotice } from './email'

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
