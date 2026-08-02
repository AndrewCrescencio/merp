import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'
const testEmail = `test-${Date.now()}@example.com`
const testPassword = 'test-password-123'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('DrizzleAuthRepository (integration)', () => {
  let repo: any

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    const mod = await import('~~/server/utils/auth/repository')
    repo = new mod.DrizzleAuthRepository()
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

  it('finds user by email after registration', async () => {
    const found = await repo.findByEmail(testEmail)

    expect(found).toMatchObject({
      email: testEmail,
      isActive: true,
    })
  })

  describe('RLS isolation', () => {
    it('prevents cross-tenant member visibility', async () => {
      const emailA = `tenant-a-${Date.now()}@example.com`
      const emailB = `tenant-b-${Date.now()}@example.com`

      const userA = await repo.register({ email: emailA, password: 'password123', name: 'User A' })
      const userB = await repo.register({ email: emailB, password: 'password123', name: 'User B' })

      const companyA = await repo.createCompany({ name: 'Company A' })
      const companyB = await repo.createCompany({ name: 'Company B' })

      await repo.createCompanyMember(companyA.id, userA.id, 'owner')
      await repo.createCompanyMember(companyB.id, userB.id, 'owner')

      const userACompanies = await repo.findUserCompanies(userA.id)
      expect(userACompanies).toHaveLength(1)
      expect(userACompanies[0].id).toBe(companyA.id)

      const userBCompanies = await repo.findUserCompanies(userB.id)
      expect(userBCompanies).toHaveLength(1)
      expect(userBCompanies[0].id).toBe(companyB.id)
    })

    it('allows company search without tenant context', async () => {
      const result = await repo.searchCompanies('Company')
      expect(result.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('company membership roles', () => {
    it('returns the role of a member and null for non-members', async () => {
      const email = `role-${Date.now()}@example.com`
      const user = await repo.register({ email, password: 'password123', name: 'Role User' })
      const company = await repo.createCompany({ name: 'Role Company' })

      expect(await repo.getCompanyMembershipRole(user.id, company.id)).toBeNull()

      await repo.createCompanyMember(company.id, user.id, 'owner')
      expect(await repo.getCompanyMembershipRole(user.id, company.id)).toBe('owner')

      const outsider = await repo.register({
        email: `outsider-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Outsider',
      })
      expect(await repo.getCompanyMembershipRole(outsider.id, company.id)).toBeNull()
    })
  })

  describe('invites', () => {
    it('creates, lists, finds and accepts an invite', async () => {
      const ownerEmail = `owner-${Date.now()}@example.com`
      const inviteeEmail = `invitee-${Date.now()}@example.com`
      const owner = await repo.register({
        email: ownerEmail,
        password: 'password123',
        name: 'Owner',
      })
      const invitee = await repo.register({
        email: inviteeEmail,
        password: 'password123',
        name: 'Invitee',
      })
      const company = await repo.createCompany({ name: 'Invite Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')

      const created = await repo.createInvite({
        companyId: company.id,
        email: inviteeEmail,
        invitedBy: owner.id,
      })
      expect(created).toMatchObject({ companyId: company.id, email: inviteeEmail })
      expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now())

      const pending = await repo.findPendingInvite(company.id, inviteeEmail)
      expect(pending?.id).toBe(created.id)

      const listed = await repo.listCompanyInvites(company.id)
      expect(listed.map((i: any) => i.id)).toContain(created.id)

      const accepted = await repo.acceptInvite(company.id, inviteeEmail, invitee.id)
      expect(accepted.acceptedAt).toBeInstanceOf(Date)

      expect(await repo.findPendingInvite(company.id, inviteeEmail)).toBeNull()
      expect(await repo.isCompanyMember(invitee.id, company.id)).toBe(true)
      expect(await repo.getCompanyMembershipRole(invitee.id, company.id)).toBe('member')
    })

    it('rejects duplicate invites for the same company and email', async () => {
      const ownerEmail = `dupowner-${Date.now()}@example.com`
      const inviteeEmail = `dupinvitee-${Date.now()}@example.com`
      const owner = await repo.register({
        email: ownerEmail,
        password: 'password123',
        name: 'Dup Owner',
      })
      const company = await repo.createCompany({ name: 'Dup Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')

      await repo.createInvite({ companyId: company.id, email: inviteeEmail, invitedBy: owner.id })

      await expect(
        repo.createInvite({ companyId: company.id, email: inviteeEmail, invitedBy: owner.id }),
      ).rejects.toMatchObject({ statusCode: 409 })
    })

    it('returns null for expired invites', async () => {
      const ownerEmail = `expowner-${Date.now()}@example.com`
      const owner = await repo.register({
        email: ownerEmail,
        password: 'password123',
        name: 'Exp Owner',
      })
      const company = await repo.createCompany({ name: 'Exp Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')

      const { withTenant } = await import('~~/server/utils/auth/tenant-context')
      const { invite } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      const created = await repo.createInvite({
        companyId: company.id,
        email: `expired-${Date.now()}@example.com`,
        invitedBy: owner.id,
      })

      await withTenant(company.id, null, async (tx) => {
        await tx
          .update(invite)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(invite.id, created.id))
      })

      expect(await repo.findPendingInvite(company.id, created.email)).toBeNull()
    })
  })

  describe('company_member insert/update policies (0008)', () => {
    it('lets an owner add a member to their own company', async () => {
      const owner = await repo.register({
        email: `add-owner-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Add Owner',
      })
      const member = await repo.register({
        email: `add-member-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Add Member',
      })
      const company = await repo.createCompany({ name: 'Add Member Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')

      await repo.createCompanyMember(company.id, member.id, 'member')

      expect(await repo.getCompanyMembershipRole(member.id, company.id)).toBe('member')
    })

    it('blocks an outsider from inserting themselves as owner via raw SQL', async () => {
      const owner = await repo.register({
        email: `raw-owner-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Raw Owner',
      })
      const outsider = await repo.register({
        email: `raw-outsider-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Raw Outsider',
      })
      const company = await repo.createCompany({ name: 'Raw Insert Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')

      const { db } = await import('~~/server/utils/db')
      const { companyMember } = await import('~~/server/utils/schema')
      const { getPostgresErrorCode } = await import('~~/server/utils/auth/helpers')

      await expect(
        db.insert(companyMember).values({
          companyId: company.id,
          userId: outsider.id,
          role: 'owner',
        }),
      ).rejects.toSatisfy((error: unknown) => getPostgresErrorCode(error) === '42501')
    })

    it('blocks a member from promoting themselves to owner via UPDATE', async () => {
      const owner = await repo.register({
        email: `up-owner-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Up Owner',
      })
      const member = await repo.register({
        email: `up-member-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Up Member',
      })
      const company = await repo.createCompany({ name: 'Up Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')
      await repo.createCompanyMember(company.id, member.id, 'member')

      const { withTenant } = await import('~~/server/utils/auth/tenant-context')
      const { companyMember } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')
      const { getPostgresErrorCode } = await import('~~/server/utils/auth/helpers')

      await expect(
        withTenant(company.id, member.id, (tx) =>
          tx
            .update(companyMember)
            .set({ role: 'owner' })
            .where(eq(companyMember.userId, member.id)),
        ),
      ).rejects.toSatisfy((error: unknown) => getPostgresErrorCode(error) === '42501')
    })

    it('blocks a member from moving their own row to another company via UPDATE', async () => {
      const ownerA = await repo.register({
        email: `move-owner-a-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Move Owner A',
      })
      const ownerB = await repo.register({
        email: `move-owner-b-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Move Owner B',
      })
      const member = await repo.register({
        email: `move-member-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Move Member',
      })
      const companyA = await repo.createCompany({ name: 'Move Company A' })
      const companyB = await repo.createCompany({ name: 'Move Company B' })
      await repo.createCompanyMember(companyA.id, ownerA.id, 'owner')
      await repo.createCompanyMember(companyB.id, ownerB.id, 'owner')
      await repo.createCompanyMember(companyA.id, member.id, 'member')

      const { withTenant } = await import('~~/server/utils/auth/tenant-context')
      const { companyMember } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')
      const { getPostgresErrorCode } = await import('~~/server/utils/auth/helpers')

      await expect(
        withTenant(companyA.id, member.id, (tx) =>
          tx
            .update(companyMember)
            .set({ companyId: companyB.id })
            .where(eq(companyMember.userId, member.id)),
        ),
      ).rejects.toSatisfy((error: unknown) => getPostgresErrorCode(error) === '42501')
    })
  })
})
