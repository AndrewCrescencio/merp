import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('auth security state (integration)', () => {
  let helpers: {
    checkRateLimit: (event: unknown, email: string) => Promise<void>
    checkAccountLockout: (email: string) => Promise<void>
    recordFailedAttempt: (email: string) => Promise<void>
    resetFailedAttempts: (email: string) => Promise<void>
  }
  let db: any
  let authSecurityState: any
  let eq: any

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    helpers = await import('~~/server/utils/shared/security')
    db = (await import('~~/server/utils/db')).db
    authSecurityState = (await import('~~/server/utils/schema')).authSecurityState
    eq = (await import('drizzle-orm')).eq
  })

  const mockEvent = (ip?: string) => ({
    context: {},
    node: {
      req: { socket: { remoteAddress: ip ?? undefined } },
      res: { setHeader: () => {} },
    },
  })

  it('allows 5 requests per email, then blocks the 6th with 429 (FR-010)', async () => {
    const email = `rate-${Date.now()}@example.com`
    const event = mockEvent()

    for (let i = 0; i < 5; i++) {
      await helpers.checkRateLimit(event, email)
    }

    const err = await helpers.checkRateLimit(event, email).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 429 })
    const body = JSON.parse((err as { message: string }).message)
    expect(body).toMatchObject({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Try again later.',
    })
    expect(body.retryAfter).toBeGreaterThan(0)
  })

  it('reopens the rate limit window once resetAt elapses', async () => {
    const email = `rate-reset-${Date.now()}@example.com`
    const event = mockEvent()

    for (let i = 0; i < 5; i++) {
      await helpers.checkRateLimit(event, email)
    }
    await expect(helpers.checkRateLimit(event, email)).rejects.toMatchObject({ statusCode: 429 })

    await db
      .update(authSecurityState)
      .set({ resetAt: new Date(Date.now() - 60_000) })
      .where(eq(authSecurityState.key, `rate:${email}`))

    await expect(helpers.checkRateLimit(event, email)).resolves.toBeUndefined()
  })

  it('blocks the 21st request from the same IP across different emails', async () => {
    const ip = `203.0.113.${(Date.now() % 250) + 1}`
    const event = mockEvent(ip)

    for (let i = 0; i < 20; i++) {
      await helpers.checkRateLimit(event, `ip-rate-${i}-${Date.now()}@example.com`)
    }

    const err = await helpers
      .checkRateLimit(event, `ip-rate-over-${Date.now()}@example.com`)
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 429 })
    const body = JSON.parse((err as { message: string }).message)
    expect(body).toMatchObject({ error: 'rate_limit_exceeded' })
  })

  it('does not rate limit by IP when the request has no socket address', async () => {
    const event = mockEvent()

    for (let i = 0; i < 6; i++) {
      await expect(
        helpers.checkRateLimit(event, `no-socket-${i}-${Date.now()}@example.com`),
      ).resolves.toBeUndefined()
    }
  })

  it('locks the account after 10 consecutive failed attempts', async () => {
    const email = `lock-${Date.now()}@example.com`

    for (let i = 0; i < 10; i++) {
      await helpers.recordFailedAttempt(email)
    }

    await expect(helpers.checkAccountLockout(email)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('account_locked'),
    })
  })

  it('unlocks after the lockout window elapses and resets the counter', async () => {
    const email = `lock-reset-${Date.now()}@example.com`

    for (let i = 0; i < 10; i++) {
      await helpers.recordFailedAttempt(email)
    }
    await expect(helpers.checkAccountLockout(email)).rejects.toMatchObject({ statusCode: 401 })

    await db
      .update(authSecurityState)
      .set({ lockedUntil: new Date(Date.now() - 1_000) })
      .where(eq(authSecurityState.key, `lockout:${email}`))

    await expect(helpers.checkAccountLockout(email)).resolves.toBeUndefined()

    await helpers.recordFailedAttempt(email)
    await expect(helpers.checkAccountLockout(email)).resolves.toBeUndefined()
  })

  it('resetFailedAttempts clears the lockout state', async () => {
    const email = `lock-clear-${Date.now()}@example.com`

    for (let i = 0; i < 10; i++) {
      await helpers.recordFailedAttempt(email)
    }
    await expect(helpers.checkAccountLockout(email)).rejects.toMatchObject({ statusCode: 401 })

    await helpers.resetFailedAttempts(email)

    await expect(helpers.checkAccountLockout(email)).resolves.toBeUndefined()
  })
})
