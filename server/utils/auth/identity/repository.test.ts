import { describe, it, expect, beforeAll } from 'vitest'

// Must be set before any module imports that use the database
process.env.APP_DATABASE_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const _INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'
const testEmail = `test-${Date.now()}@example.com`
const testPassword = 'test-password-123'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

// Note: Email verification tests are skipped because Better Auth with no-op
// sendVerificationEmail callback doesn't persist verification tokens to DB.
// These flows are tested at the API/handler level instead.

describe.skipIf(!dbAvailable)('Identity queries (integration)', () => {
  let queries: typeof import('~~/server/utils/auth/identity/queries')

  beforeAll(async () => {
    queries = await import('~~/server/utils/auth/identity/queries')
  })

  it('registers a new user (AUD-04 sendOnSignUp)', async () => {
    const result = await queries.registerUser({
      email: testEmail,
      password: testPassword,
      name: 'Test User',
    })

    expect(result).toMatchObject({
      email: testEmail,
      name: 'Test User',
      isActive: true,
    })
    expect(result!.id).toBeTruthy()
    expect(result!.createdAt).toBeInstanceOf(Date)
  })

  it('AUD-03: duplicate email registration resolves without 409 and without creating a second account', async () => {
    const email = `dup-${Date.now()}@example.com`
    const first = await queries.registerUser({ email, password: testPassword, name: 'First User' })

    const second = await queries.registerUser({
      email,
      password: testPassword,
      name: 'Second User',
      consentTermsVersion: 'v1',
    })

    expect(second).toBeNull()
    const found = await queries.findUserByEmail(email)
    expect(found?.id).toBe(first!.id)
    expect(found?.name).toBe('First User')
    expect(found?.consentTermsVersion).toBeNull()
    expect(found?.consentTermsAcceptedAt).toBeNull()
  })

  it('rejects invalid password with 401', async () => {
    const headers = new Headers()

    await expect(
      queries.signInUser({ email: testEmail, password: 'wrong-password' }, headers),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects non-existent email with 401', async () => {
    const headers = new Headers()

    await expect(
      queries.signInUser({ email: 'nonexistent@example.com', password: testPassword }, headers),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects sign-in for deactivated users with account_deactivated', async () => {
    const email = `deactivated-${Date.now()}@example.com`
    const user = await queries.registerUser({
      email,
      password: testPassword,
      name: 'Deactivated User',
    })
    await queries.deactivateUser(user!.id)

    const headers = new Headers()

    await expect(queries.signInUser({ email, password: testPassword }, headers)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        'statusCode' in error &&
        error.statusCode === 401 &&
        JSON.parse(error.message).error === 'account_deactivated',
    )
  })

  it('AUD-07: sign-in attempt on a deactivated account creates no session', async () => {
    const email = `aud07-${Date.now()}@example.com`
    const userRecord = await queries.registerUser({
      email,
      password: testPassword,
      name: 'Aud07 User',
    })
    await queries.deactivateUser(userRecord!.id)

    const headers = new Headers()

    await expect(queries.signInUser({ email, password: testPassword }, headers)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        'statusCode' in error &&
        error.statusCode === 401 &&
        JSON.parse(error.message).error === 'account_deactivated',
    )

    const { db } = await import('~~/server/utils/db')
    const { session } = await import('~~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const rows = await db.select().from(session).where(eq(session.userId, userRecord!.id))
    expect(rows).toHaveLength(0)
  })

  it('finds user by email after registration', async () => {
    const found = await queries.findUserByEmail(testEmail)

    expect(found).toMatchObject({
      email: testEmail,
      isActive: true,
    })
  })

  describe('consent withdrawal (FR-021)', () => {
    it('deactivates the user, stamps consentWithdrawnAt and ends all sessions', async () => {
      const email = `consent-${Date.now()}@example.com`
      const userRecord = await queries.registerUser({
        email,
        password: testPassword,
        name: 'Consent User',
      })

      const { db } = await import('~~/server/utils/db')
      const { session, user } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      const token = `consent-token-${Date.now()}`
      await db.insert(session).values({
        userId: userRecord!.id,
        token,
        expiresAt: new Date(Date.now() + 60_000),
      })

      const result = await queries.withdrawConsent(userRecord!.id)

      expect(result.isActive).toBe(false)
      expect(result.consentWithdrawnAt).toBeInstanceOf(Date)

      const [found] = await db.select().from(user).where(eq(user.id, userRecord!.id))
      expect(found?.isActive).toBe(false)
      expect(found?.consentWithdrawnAt).toBeInstanceOf(Date)

      // FR-021: término de sessão — nem por usuário, nem pelo token criado.
      expect(
        await db.select().from(session).where(eq(session.userId, userRecord!.id)),
      ).toHaveLength(0)
      expect(await db.select().from(session).where(eq(session.token, token))).toHaveLength(0)
    })

    it('rejects sign-in with account_deactivated after consent withdrawal', async () => {
      const email = `consent-signin-${Date.now()}@example.com`
      const userRecord = await queries.registerUser({
        email,
        password: testPassword,
        name: 'Consent SignIn',
      })

      await queries.withdrawConsent(userRecord!.id)

      const headers = new Headers()

      await expect(
        queries.signInUser({ email, password: testPassword }, headers),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error &&
          'statusCode' in error &&
          error.statusCode === 401 &&
          JSON.parse(error.message).error === 'account_deactivated',
      )
    })

    it('sends a password reset for an existing email without throwing', async () => {
      const email = `reset-${Date.now()}@example.com`
      await queries.registerUser({
        email,
        password: testPassword,
        name: 'Reset User',
      })

      await expect(queries.requestPasswordResetBA(email)).resolves.toBeUndefined()
    })

    it('returns generically for unknown emails (anti-enumeration)', async () => {
      const ghostEmail = `ghost-${Date.now()}@example.com`

      await expect(queries.requestPasswordResetBA(ghostEmail)).resolves.toBeUndefined()
    })
  })

  describe('FR-020: LGPD export event listing', () => {
    it("lists only the user's own events (excludes other users and user-less rows)", async () => {
      const stamp = Date.now()
      const emailA = `export-a-${stamp}@example.com`
      const emailB = `export-b-${stamp}@example.com`
      const userA = await queries.registerUser({
        email: emailA,
        password: testPassword,
        name: 'User A',
      })
      const userB = await queries.registerUser({
        email: emailB,
        password: testPassword,
        name: 'User B',
      })

      const { db } = await import('~~/server/utils/db')
      const { authEvent } = await import('~~/server/utils/schema')
      await db.insert(authEvent).values({
        email: 'system@merp.local',
        eventType: 'system_event',
        metadata: { note: 'user-less row' },
      })

      const eventsA = await queries.listUserAuthEvents(userA!.id)
      const eventsB = await queries.listUserAuthEvents(userB!.id)

      expect(eventsA.every((e) => e.userId === userA!.id)).toBe(true)
      expect(eventsB.every((e) => e.userId === userB!.id)).toBe(true)
      expect(eventsA.some((e) => e.userId === userB!.id)).toBe(false)
      expect(eventsB.some((e) => e.userId === userA!.id)).toBe(false)
      expect(eventsA.some((e) => e.userId === null)).toBe(false)
      expect(eventsB.some((e) => e.userId === null)).toBe(false)
    })
  })
})
