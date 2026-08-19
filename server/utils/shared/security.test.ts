import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('auth security state (integration)', () => {
  let helpers: {
    checkIpRateLimit: (event: unknown) => Promise<void>
    checkEmailRateLimit: (event: unknown, email: string) => Promise<void>
    checkUserRateLimit: (event: unknown, userId: string) => Promise<void>
    checkAccountLockout: (email: string, ip?: string | null) => Promise<void>
    recordFailedAttempt: (email: string, ip?: string | null) => Promise<void>
    resetFailedAttempts: (email: string, ip?: string | null) => Promise<void>
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
      await helpers.checkEmailRateLimit(event, email)
    }

    const err = await helpers.checkEmailRateLimit(event, email).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 429 })
    const body = JSON.parse((err as { message: string }).message)
    expect(body).toMatchObject({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Try again later.',
    })
    expect(body.retryAfter).toBeGreaterThan(0)
  })

  it('reopens the rate limit window once 60s elapse (sliding window)', async () => {
    const email = `rate-reset-${Date.now()}@example.com`
    const event = mockEvent()

    for (let i = 0; i < 5; i++) {
      await helpers.checkEmailRateLimit(event, email)
    }
    await expect(helpers.checkEmailRateLimit(event, email)).rejects.toMatchObject({
      statusCode: 429,
    })

    // Simula 60s decorridos: os hits saem da janela de 60s.
    const [row] = await db
      .select({ window: authSecurityState.window })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, `rate:${email}`))
    const shifted = (row.window as string[]).map((hit) =>
      new Date(Date.parse(hit) - 60_000).toISOString(),
    )
    await db
      .update(authSecurityState)
      .set({ window: shifted })
      .where(eq(authSecurityState.key, `rate:${email}`))

    await expect(helpers.checkEmailRateLimit(event, email)).resolves.toBeUndefined()
  })

  it('blocks the 21st request from the same IP', async () => {
    const ip = `203.0.113.${(Date.now() % 250) + 1}`
    const event = mockEvent(ip)

    for (let i = 0; i < 20; i++) {
      await helpers.checkIpRateLimit(event)
    }

    const err = await helpers.checkIpRateLimit(event).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 429 })
    const body = JSON.parse((err as { message: string }).message)
    expect(body).toMatchObject({ error: 'rate_limit_exceeded' })
  })

  it('does not rate limit by IP when the request has no socket address', async () => {
    const event = mockEvent()

    for (let i = 0; i < 6; i++) {
      await expect(helpers.checkIpRateLimit(event)).resolves.toBeUndefined()
    }
  })

  it('AUD-16: blocks the 61st request from the same user with key rate:user:<id>', async () => {
    const userId = `user-${Date.now()}`
    const event = mockEvent()

    for (let i = 0; i < 60; i++) {
      await helpers.checkUserRateLimit(event, userId)
    }

    const err = await helpers.checkUserRateLimit(event, userId).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 429 })
    const body = JSON.parse((err as { message: string }).message)
    expect(body).toMatchObject({ error: 'rate_limit_exceeded' })
    expect(body.retryAfter).toBeGreaterThan(0)

    const [row] = await db
      .select({ window: authSecurityState.window })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, `rate:user:${userId}`))
    expect(row.window.length).toBe(60)
  })

  it('AUD-16: reopens the per-user window once 60s elapse (sliding window)', async () => {
    const userId = `user-reset-${Date.now()}`
    const event = mockEvent()

    for (let i = 0; i < 60; i++) {
      await helpers.checkUserRateLimit(event, userId)
    }
    await expect(helpers.checkUserRateLimit(event, userId)).rejects.toMatchObject({
      statusCode: 429,
    })

    const [row] = await db
      .select({ window: authSecurityState.window })
      .from(authSecurityState)
      .where(eq(authSecurityState.key, `rate:user:${userId}`))
    const shifted = (row.window as string[]).map((hit) =>
      new Date(Date.parse(hit) - 60_000).toISOString(),
    )
    await db
      .update(authSecurityState)
      .set({ window: shifted })
      .where(eq(authSecurityState.key, `rate:user:${userId}`))

    await expect(helpers.checkUserRateLimit(event, userId)).resolves.toBeUndefined()
  })

  it('locks the (email, IP) pair after 10 failures from the same IP', async () => {
    const email = `lock-${Date.now()}@example.com`
    const attackerIp = `203.0.113.${(Date.now() % 250) + 1}`
    const victimIp = `198.51.100.${(Date.now() % 250) + 1}`

    for (let i = 0; i < 10; i++) {
      await helpers.recordFailedAttempt(email, attackerIp)
    }

    await expect(helpers.checkAccountLockout(email, attackerIp)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('account_locked'),
    })

    // AUD-02: o lockout por (email+IP) não bloqueia a vítima em outro IP.
    await expect(helpers.checkAccountLockout(email, victimIp)).resolves.toBeUndefined()
  })

  it('locks the account for all IPs after 50 failures from rotating IPs (global tier, AUD-02)', async () => {
    const email = `lock-global-${Date.now()}@example.com`

    for (let i = 0; i < 50; i++) {
      await helpers.recordFailedAttempt(email, `203.0.113.${(i % 250) + 1}`)
    }

    await expect(
      helpers.checkAccountLockout(email, `198.51.100.${(Date.now() % 250) + 1}`),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('unlocks after the lockout window elapses and resets the counter', async () => {
    const email = `lock-reset-${Date.now()}@example.com`
    const ip = `203.0.113.${(Date.now() % 250) + 1}`

    for (let i = 0; i < 10; i++) {
      await helpers.recordFailedAttempt(email, ip)
    }
    await expect(helpers.checkAccountLockout(email, ip)).rejects.toMatchObject({ statusCode: 401 })

    await db
      .update(authSecurityState)
      .set({ lockedUntil: new Date(Date.now() - 1_000) })
      .where(eq(authSecurityState.key, `lockout:${email}:${ip}`))

    await expect(helpers.checkAccountLockout(email, ip)).resolves.toBeUndefined()

    await helpers.recordFailedAttempt(email, ip)
    await expect(helpers.checkAccountLockout(email, ip)).resolves.toBeUndefined()
  })

  it('resetFailedAttempts clears both lockout tiers', async () => {
    const email = `lock-clear-${Date.now()}@example.com`
    const ip = `203.0.113.${(Date.now() % 250) + 1}`

    for (let i = 0; i < 10; i++) {
      await helpers.recordFailedAttempt(email, ip)
    }
    await expect(helpers.checkAccountLockout(email, ip)).rejects.toMatchObject({ statusCode: 401 })

    await helpers.resetFailedAttempts(email, ip)

    await expect(helpers.checkAccountLockout(email, ip)).resolves.toBeUndefined()
  })

  it('with no IP, failures count only toward the global tier', async () => {
    const email = `lock-noip-${Date.now()}@example.com`

    for (let i = 0; i < 10; i++) {
      await helpers.recordFailedAttempt(email)
    }

    // Sem IP não há camada por-par: 10 falhas (abaixo do limiar global de 50)
    // não travam nada.
    await expect(helpers.checkAccountLockout(email)).resolves.toBeUndefined()
    await expect(
      helpers.checkAccountLockout(email, `198.51.100.${(Date.now() % 250) + 1}`),
    ).resolves.toBeUndefined()
  })
})
