import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'
const testEmail = `test-${Date.now()}@example.com`
const testPassword = 'test-password-123'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('IdentityRepository (integration)', () => {
  let repo: any

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    const mod = await import('~~/server/utils/auth/identity/repository')
    repo = new mod.IdentityRepository()
  })

  it('registers a new user', async () => {
    const result = await repo.register({
      email: testEmail,
      password: testPassword,
      name: 'Test User',
    })

    expect(result).toMatchObject({
      email: testEmail,
      name: 'Test User',
      isActive: true,
    })
    expect(result.id).toBeTruthy()
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('AUD-03: duplicate email registration resolves without 409 and without creating a second account', async () => {
    const email = `dup-${Date.now()}@example.com`
    const first = await repo.register({ email, password: testPassword, name: 'First User' })

    const second = await repo.register({
      email,
      password: testPassword,
      name: 'Second User',
      consentTermsVersion: 'v1',
    })

    expect(second).toBeNull()
    const found = await repo.findByEmail(email)
    expect(found?.id).toBe(first.id)
    expect(found?.name).toBe('First User')
    expect(found?.consentTermsVersion).toBeNull()
    expect(found?.consentTermsAcceptedAt).toBeNull()
  })

  it('signs in with registered credentials', async () => {
    const headers = new Headers()
    const result = await repo.signIn({ email: testEmail, password: testPassword }, headers)

    expect(result).toMatchObject({
      email: testEmail,
      name: 'Test User',
      isActive: true,
    })
    expect(result.id).toBeTruthy()
  })

  it('emits session_created auth event after sign-in (FR-023)', async () => {
    const headers = new Headers()
    const result = await repo.signIn({ email: testEmail, password: testPassword }, headers)

    // session_created é fire-and-forget: aguarda o insert chegar no auth_event.
    const { db } = await import('~~/server/utils/db')
    const { authEvent } = await import('~~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    const { and } = await import('drizzle-orm')

    let event: any
    for (let attempt = 0; attempt < 20; attempt++) {
      const [found] = await db
        .select()
        .from(authEvent)
        .where(and(eq(authEvent.userId, result.id), eq(authEvent.eventType, 'session_created')))
        .limit(1)
      if (found) {
        event = found
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }

    expect(event).toBeTruthy()
    expect(event.email).toBe(testEmail)
    expect(event.metadata).toMatchObject({
      userId: result.id,
      sessionId: expect.any(String),
      tenantId: null,
    })
  })

  it('rejects invalid password with 401', async () => {
    const headers = new Headers()

    await expect(
      repo.signIn({ email: testEmail, password: 'wrong-password' }, headers),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects non-existent email with 401', async () => {
    const headers = new Headers()

    await expect(
      repo.signIn({ email: 'nonexistent@example.com', password: testPassword }, headers),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects sign-in for deactivated users with account_deactivated', async () => {
    const email = `deactivated-${Date.now()}@example.com`
    const user = await repo.register({
      email,
      password: testPassword,
      name: 'Deactivated User',
    })
    await repo.deactivateUser(user.id)

    const headers = new Headers()

    await expect(repo.signIn({ email, password: testPassword }, headers)).rejects.toSatisfy(
      (error: any) =>
        error?.statusCode === 401 && JSON.parse(error.message)?.error === 'account_deactivated',
    )
  })

  it('AUD-07: sign-in attempt on a deactivated account creates no session', async () => {
    const email = `aud07-${Date.now()}@example.com`
    const userRecord = await repo.register({
      email,
      password: testPassword,
      name: 'Aud07 User',
    })
    await repo.deactivateUser(userRecord.id)

    const headers = new Headers()

    await expect(repo.signIn({ email, password: testPassword }, headers)).rejects.toSatisfy(
      (error: any) =>
        error?.statusCode === 401 && JSON.parse(error.message)?.error === 'account_deactivated',
    )

    const { db } = await import('~~/server/utils/db')
    const { session } = await import('~~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const rows = await db.select().from(session).where(eq(session.userId, userRecord.id))
    expect(rows).toHaveLength(0)
  })

  it('finds user by email after registration', async () => {
    const found = await repo.findByEmail(testEmail)

    expect(found).toMatchObject({
      email: testEmail,
      isActive: true,
    })
  })

  describe('consent withdrawal (FR-021)', () => {
    it('deactivates the user, stamps consentWithdrawnAt and ends all sessions', async () => {
      const email = `consent-${Date.now()}@example.com`
      const userRecord = await repo.register({
        email,
        password: testPassword,
        name: 'Consent User',
      })

      const session = await repo.createSession(
        userRecord.id,
        `consent-token-${Date.now()}`,
        new Date(Date.now() + 60_000),
        false,
      )

      const result = await repo.withdrawConsent(userRecord.id)

      expect(result.isActive).toBe(false)
      expect(result.consentWithdrawnAt).toBeInstanceOf(Date)

      const found = await repo.findById(userRecord.id)
      expect(found?.isActive).toBe(false)
      expect(found?.consentWithdrawnAt).toBeInstanceOf(Date)

      const sessions = await repo.getUserSessions(userRecord.id)
      expect(sessions).toHaveLength(0)
      expect(await repo.validateSession(session.token)).toBeNull()
    })

    it('rejects sign-in with account_deactivated after consent withdrawal', async () => {
      const email = `consent-signin-${Date.now()}@example.com`
      const userRecord = await repo.register({
        email,
        password: testPassword,
        name: 'Consent SignIn',
      })

      await repo.withdrawConsent(userRecord.id)

      const headers = new Headers()

      await expect(repo.signIn({ email, password: testPassword }, headers)).rejects.toSatisfy(
        (error: any) =>
          error?.statusCode === 401 && JSON.parse(error.message)?.error === 'account_deactivated',
      )
    })
  })
})
