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

    it('prevents cross-tenant SELECT without tenant context (fail-closed 0 rows)', async () => {
      const emailA = `iso-select-a-${Date.now()}@example.com`
      const emailB = `iso-select-b-${Date.now()}@example.com`

      const userA = await repo.register({ email: emailA, password: 'password123', name: 'Sel A' })
      const userB = await repo.register({ email: emailB, password: 'password123', name: 'Sel B' })

      const companyA = await repo.createCompany({ name: 'Sel Company A' })
      const companyB = await repo.createCompany({ name: 'Sel Company B' })

      await repo.createCompanyMember(companyA.id, userA.id, 'owner')
      await repo.createCompanyMember(companyB.id, userB.id, 'owner')

      const { withTenant } = await import('~~/server/utils/auth/tenant-context')
      const { companyMember } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      // cm_select_policy confia no tenant context (fornecido pelo app, não pelo
      // atacante) — sem contexto, user A não vê nada da empresa B (fail-closed).
      const rows = await withTenant(null, userA.id, (tx) =>
        tx.select().from(companyMember).where(eq(companyMember.companyId, companyB.id)),
      )

      expect(rows).toHaveLength(0)
    })

    it('prevents cross-tenant UPDATE on company via raw SQL (0 rows)', async () => {
      const emailA = `iso-update-a-${Date.now()}@example.com`
      const emailB = `iso-update-b-${Date.now()}@example.com`

      const userA = await repo.register({ email: emailA, password: 'password123', name: 'Upd A' })
      const userB = await repo.register({ email: emailB, password: 'password123', name: 'Upd B' })

      const companyA = await repo.createCompany({ name: 'Upd Company A' })
      const companyB = await repo.createCompany({ name: 'Upd Company B' })

      await repo.createCompanyMember(companyA.id, userA.id, 'owner')
      await repo.createCompanyMember(companyB.id, userB.id, 'owner')

      const { withTenant } = await import('~~/server/utils/auth/tenant-context')
      const { company } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      const updated = await withTenant(companyB.id, userA.id, (tx) =>
        tx.update(company).set({ name: 'Hacked' }).where(eq(company.id, companyB.id)).returning(),
      )

      expect(updated).toHaveLength(0)
      expect(await repo.findCompanyById(companyB.id)).toMatchObject({ name: 'Upd Company B' })
    })

    it('allows company search without tenant context', async () => {
      const result = await repo.searchCompanies('Company')
      expect(result.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('createCompanyWithOwner', () => {
    it('creates company and owner atomically', async () => {
      const owner = await repo.register({
        email: `atomic-owner-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Atomic Owner',
      })

      const company = await repo.createCompanyWithOwner({ name: 'Atomic Company' }, owner.id)

      expect(company).toMatchObject({ name: 'Atomic Company', isDeleted: false })
      expect(await repo.getCompanyMembershipRole(owner.id, company.id)).toBe('owner')
    })

    it('rolls back company creation when owner insert fails', async () => {
      const name = `Atomic Fail ${Date.now()}`

      await expect(repo.createCompanyWithOwner({ name }, 'nonexistent-user-id')).rejects.toThrow()

      const results = await repo.searchCompanies('Atomic Fail')
      expect(results.some((c: any) => c.name === name)).toBe(false)
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

  describe('company delete policies (0009)', () => {
    it('lets an owner soft-delete their company (company before members)', async () => {
      const owner = await repo.register({
        email: `del-owner-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Del Owner',
      })
      const member = await repo.register({
        email: `del-member-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Del Member',
      })
      const company = await repo.createCompany({ name: 'Del Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')
      await repo.createCompanyMember(company.id, member.id, 'member')

      const result = await repo.softDeleteCompany(company.id, owner.id)

      expect(result).toMatchObject({ id: company.id, isDeleted: true })
      expect(await repo.findCompanyById(company.id)).toBeNull()
      expect(await repo.getCompanyMembershipRole(member.id, company.id)).toBeNull()
      expect(await repo.getCompanyMembershipRole(owner.id, company.id)).toBeNull()
    })

    it('backstop TOCTOU: a member cannot soft-delete the company (404, RLS denied)', async () => {
      const owner = await repo.register({
        email: `toc-owner-${Date.now()}@example.com`,
        password: 'password123',
        name: 'TOC Owner',
      })
      const member = await repo.register({
        email: `toc-member-${Date.now()}@example.com`,
        password: 'password123',
        name: 'TOC Member',
      })
      const company = await repo.createCompany({ name: 'TOC Company' })
      await repo.createCompanyMember(company.id, owner.id, 'owner')
      await repo.createCompanyMember(company.id, member.id, 'member')

      await expect(repo.softDeleteCompany(company.id, member.id)).rejects.toMatchObject({
        statusCode: 404,
      })

      expect(await repo.findCompanyById(company.id)).toMatchObject({ id: company.id })
      expect(await repo.getCompanyMembershipRole(member.id, company.id)).toBe('member')
    })
  })
})
