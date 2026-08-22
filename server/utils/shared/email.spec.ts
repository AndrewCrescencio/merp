import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '#shared/logger'
import { db } from '~~/server/utils/db'
import { emailQueue } from '~~/server/utils/schema'
import { eq } from 'drizzle-orm'
import {
  appVerificationLink,
  sendDeactivationNotice,
  sendPasswordResetLink,
  sendVerificationEmailLink,
} from './email'

const loggerErrorSpy = vi.spyOn(logger, 'error')
const loggerWarnSpy = vi.spyOn(logger, 'warn')
const dbInsertSpy = vi.spyOn(db, 'insert')

describe('sendDeactivationNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbInsertSpy.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('queues the deactivation notice with correct payload', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')

    await sendDeactivationNotice('inactive@example.com')

    expect(dbInsertSpy).toHaveBeenCalledWith(emailQueue)
    const valuesCall = dbInsertSpy.mock.results[0].value.values
    expect(valuesCall).toHaveBeenCalled()
    const payload = valuesCall.mock.calls[0][0]
    expect(payload).toMatchObject({
      to: 'inactive@example.com',
      subject: 'Your account has been deactivated',
    })
    expect(payload.html).toContain('deactivated')
    expect(payload.maxAttempts).toBe(3)
    expect(payload.status).toBe('pending')
  })

  it('skips queueing without RESEND_API_KEY/RESEND_FROM', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('RESEND_FROM', '')

    await sendDeactivationNotice('inactive@example.com')

    expect(dbInsertSpy).not.toHaveBeenCalled()
    expect(loggerWarnSpy).toHaveBeenCalled()
  })
})

describe('AUD-04 email link handling (better-auth URLs → app endpoints)', () => {
  it('verification link already points to /api/auth (basePath) and strips callbackURL', () => {
    const url = 'https://app.merp.com.br/api/auth/verify-email?token=abc&callbackURL=%2F'

    expect(appVerificationLink(url)).toBe('https://app.merp.com.br/api/auth/verify-email?token=abc')
  })

  it('handles malformed URLs gracefully', () => {
    expect(appVerificationLink('not-a-url')).toBe('not-a-url')
  })
})

describe('AUD-04 transactional email senders (queue-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbInsertSpy.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sendVerificationEmailLink queues the verification email', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')

    await sendVerificationEmailLink('new@example.com', 'https://app/api/auth/verify-email?token=x')

    expect(dbInsertSpy).toHaveBeenCalledWith(emailQueue)
    const valuesCall = dbInsertSpy.mock.results[0].value.values
    const payload = valuesCall.mock.calls[0][0]
    expect(payload).toMatchObject({
      to: 'new@example.com',
      subject: 'Verify your email address',
    })
    expect(payload.html).toContain('/api/auth/verify-email?token=x')
  })

  it('sendPasswordResetLink queues the reset email', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('RESEND_FROM', 'no-reply@merp.example.com')

    await sendPasswordResetLink('lost@example.com', 'https://app/api/auth/reset-password/tok1')

    expect(dbInsertSpy).toHaveBeenCalledWith(emailQueue)
    const valuesCall = dbInsertSpy.mock.results[0].value.values
    const payload = valuesCall.mock.calls[0][0]
    expect(payload).toMatchObject({
      to: 'lost@example.com',
      subject: 'Reset your password',
    })
    expect(payload.html).toContain('/api/auth/reset-password/tok1')
  })
})
