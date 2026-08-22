import { describe, it, expect, beforeAll, vi } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'
const testEmail = `test-${Date.now()}@example.com`
const testPassword = 'test-password-123'

// AUD-04: os envios de email são mockados — capturamos os links (e tokens)
// gerados pelo better-auth para exercitar o fluxo real de verificação/reset
// contra o banco. O mock é registrado antes de qualquer import de
// shared/auth (getAuth) via hoisting do vi.mock.
const capturedVerificationLinks: Array<{ email: string; link: string }> = []
const capturedResetLinks: Array<{ email: string; link: string }> = []

vi.mock('~~/server/utils/shared/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/shared/email')>()
  return {
    ...original,
    sendVerificationEmailLink: async (email: string, link: string) => {
      capturedVerificationLinks.push({ email, link })
    },
    sendPasswordResetLink: async (email: string, link: string) => {
      capturedResetLinks.push({ email, link })
    },
  }
})

function linkFor(captured: Array<{ email: string; link: string }>, email: string): string {
  const entry = [...captured].reverse().find((e) => e.email === email)
  if (!entry) throw new Error(`No email captured for ${email}`)
  return entry.link
}

function tokenFromLink(link: string): string {
  const token = new URL(link).searchParams.get('token')
  if (!token) throw new Error(`No token in link: ${link}`)
  return token
}

function resetTokenFromLink(link: string): string {
  const match = link.match(/\/reset-password\/([^/?]+)/)
  if (!match) throw new Error(`No reset token in link: ${link}`)
  return match[1]
}

async function verifyEmailLink(link: string): Promise<void> {
  const { getAuth } = await import('#shared/auth')
  const auth = await getAuth()
  await auth.api.verifyEmail({ query: { token: tokenFromLink(link) } })
}

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('IdentityRepository (integration)', () => {
  let repo: any

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    const mod = await import('~~/server/utils/auth/identity/repository')
    repo = new mod.IdentityRepository()
  })

  it('registers a new user and sends a verification email (AUD-04 sendOnSignUp)', async () => {
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

    // O link gerado pelo better-auth foi reescrito para a rota do app.
    const link = linkFor(capturedVerificationLinks, testEmail)
    expect(link).toMatch(/\/api\/auth\/verify-email\?token=/)
  })

  it('AUD-04: blocks login until the email is verified (403 email_not_verified)', async () => {
    const headers = new Headers()

    await expect(
      repo.signIn({ email: testEmail, password: testPassword }, headers),
    ).rejects.toSatisfy(
      (error: any) =>
        error?.statusCode === 403 && JSON.parse(error.message)?.error === 'email_not_verified',
    )
  })

  it('signs in with registered credentials after email verification', async () => {
    await verifyEmailLink(linkFor(capturedVerificationLinks, testEmail))

    const headers = new Headers()
    const result = await repo.signIn({ email: testEmail, password: testPassword }, headers)

    expect(result).toMatchObject({
      email: testEmail,
      name: 'Test User',
      isActive: true,
    })
    expect(result.id).toBeTruthy()
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

  it('emits session_created auth event after sign-in (FR-023)', async () => {
    const headers = new Headers()
    const result = await repo.signIn({ email: testEmail, password: testPassword }, headers)

    // session_created é fire-and-forget: aguarda o insert chegar no auth_event.
    const { db } = await import('~~/server/utils/db')
    const { authEvent } = await import('~~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    const { and } = await import('drizzle-orm')

    let event: any
    for (let attempt = 0; attempt < 50; attempt++) {
      const [found] = await db
        .select()
        .from(authEvent)
        .where(and(eq(authEvent.userId, result.id), eq(authEvent.eventType, 'session_created')))
        .limit(1)
      if (found) {
        event = found
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
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

  describe('AUD-04: password reset flow', () => {
    it('resets the password with a single-use token and revokes all sessions', async () => {
      const email = `aud04-reset-${Date.now()}@example.com`
      const userRecord = await repo.register({
        email,
        password: testPassword,
        name: 'Reset User',
      })
      await verifyEmailLink(linkFor(capturedVerificationLinks, email))

      const existingSession = await repo.createSession(
        userRecord.id,
        `reset-session-${Date.now()}`,
        new Date(Date.now() + 60_000),
        false,
      )

      await repo.requestPasswordReset(email)
      const resetLink = linkFor(capturedResetLinks, email)
      expect(resetLink).toMatch(/\/api\/auth\/reset-password\/[^/?]+\?callbackURL=/)
      const token = resetTokenFromLink(resetLink)

      // Validação do clique do link (GET) — não consome o token.
      expect(await repo.validateResetToken(token)).toBe(true)

      await repo.resetPassword(token, 'brand-new-password-456')

      // Senha antiga rejeitada; nova aceita.
      await expect(
        repo.signIn({ email, password: testPassword }, new Headers()),
      ).rejects.toMatchObject({ statusCode: 401 })
      const result = await repo.signIn({ email, password: 'brand-new-password-456' }, new Headers())
      expect(result.email).toBe(email)

      // revokeSessionsOnPasswordReset: sessão pré-existente invalidada.
      expect(await repo.validateSession(existingSession.token)).toBeNull()

      // Uso único: replay do token falha.
      await expect(repo.resetPassword(token, 'another-password-789')).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('returns generically for unknown emails (anti-enumeration) and captures no link', async () => {
      const ghostEmail = `ghost-${Date.now()}@example.com`

      await expect(repo.requestPasswordReset(ghostEmail)).resolves.toBeUndefined()
      expect(capturedResetLinks.some((e) => e.email === ghostEmail)).toBe(false)
    })

    it('AUD-04: real owner can take over a pre-registered account via reset + verification', async () => {
      const email = `aud04-takeover-${Date.now()}@example.com`
      await repo.register({
        email,
        password: 'attacker-password-1',
        name: 'Pre-registered',
      })

      // O dono real do email pede o reset — sem saber a senha do atacante.
      await repo.requestPasswordReset(email)
      const token = resetTokenFromLink(linkFor(capturedResetLinks, email))
      await repo.resetPassword(token, 'owner-password-999')

      // Login com a senha do dono funciona, mas a conta ainda não está
      // verificada (o link de verificação vai para a caixa do dono).
      await expect(
        repo.signIn({ email, password: 'owner-password-999' }, new Headers()),
      ).rejects.toSatisfy(
        (error: any) =>
          error?.statusCode === 403 && JSON.parse(error.message)?.error === 'email_not_verified',
      )

      // O dono clica no link de verificação (enviado para o próprio email).
      await verifyEmailLink(linkFor(capturedVerificationLinks, email))

      const result = await repo.signIn({ email, password: 'owner-password-999' }, new Headers())
      expect(result.email).toBe(email)
    })
  })

  describe('AUD-04: verification link lifecycle', () => {
    it('verification is idempotent — replaying the link succeeds', async () => {
      const email = `aud04-idem-${Date.now()}@example.com`
      await repo.register({ email, password: testPassword, name: 'Idempotent User' })
      const link = linkFor(capturedVerificationLinks, email)

      await verifyEmailLink(link)
      await verifyEmailLink(link)

      const result = await repo.signIn({ email, password: testPassword }, new Headers())
      expect(result.email).toBe(email)
    })

    it('forged verification tokens are rejected', async () => {
      const { getAuth } = await import('#shared/auth')
      const auth = await getAuth()

      await expect(auth.api.verifyEmail({ query: { token: 'forged-token' } })).rejects.toSatisfy(
        (error: any) => error?.statusCode === 401 || error?.statusCode === 400,
      )
    })
  })
})
