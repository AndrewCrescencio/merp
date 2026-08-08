import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('InviteRepository (integration)', () => {
  let repo: any
  let company: any
  let identity: any

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    repo = new (await import('~~/server/utils/auth/invite/repository')).InviteRepository()
    company = new (await import('~~/server/utils/auth/company/repository')).CompanyRepository()
    identity = new (await import('~~/server/utils/auth/identity/repository')).IdentityRepository()
  })

  const registerUser = (email: string, name: string) =>
    identity.register({ email, password: 'password123', name })

  it('creates, lists, finds and accepts an invite', async () => {
    const ownerEmail = `owner-${Date.now()}@example.com`
    const inviteeEmail = `invitee-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Owner')
    const invitee = await registerUser(inviteeEmail, 'Invitee')
    const createdCompany = await company.createCompany({ name: 'Invite Company' })
    await company.createCompanyMember(createdCompany.id, owner.id, 'owner')

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: inviteeEmail,
      invitedBy: owner.id,
    })
    expect(created).toMatchObject({ companyId: createdCompany.id, email: inviteeEmail })
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now())

    const pending = await repo.findPendingInvite(createdCompany.id, inviteeEmail)
    expect(pending?.id).toBe(created.id)

    const listed = await repo.listCompanyInvites(createdCompany.id)
    expect(listed.map((i: any) => i.id)).toContain(created.id)

    const accepted = await repo.acceptInvite(createdCompany.id, inviteeEmail, invitee.id)
    expect(accepted.acceptedAt).toBeInstanceOf(Date)

    expect(await repo.findPendingInvite(createdCompany.id, inviteeEmail)).toBeNull()
    expect(await company.isCompanyMember(invitee.id, createdCompany.id)).toBe(true)
    expect(await company.getCompanyMembershipRole(invitee.id, createdCompany.id)).toBe('member')
  })

  it('rejects duplicate invites for the same company and email', async () => {
    const ownerEmail = `dupowner-${Date.now()}@example.com`
    const inviteeEmail = `dupinvitee-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Dup Owner')
    const createdCompany = await company.createCompany({ name: 'Dup Company' })
    await company.createCompanyMember(createdCompany.id, owner.id, 'owner')

    await repo.createInvite({
      companyId: createdCompany.id,
      email: inviteeEmail,
      invitedBy: owner.id,
    })

    await expect(
      repo.createInvite({ companyId: createdCompany.id, email: inviteeEmail, invitedBy: owner.id }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('returns null for expired invites', async () => {
    const ownerEmail = `expowner-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Exp Owner')
    const createdCompany = await company.createCompany({ name: 'Exp Company' })
    await company.createCompanyMember(createdCompany.id, owner.id, 'owner')

    const { withTenant } = await import('~~/server/utils/auth/tenant-context')
    const { invite } = await import('~~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: `expired-${Date.now()}@example.com`,
      invitedBy: owner.id,
    })

    await withTenant(createdCompany.id, null, async (tx) => {
      await tx
        .update(invite)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(invite.id, created.id))
    })

    expect(await repo.findPendingInvite(createdCompany.id, created.email)).toBeNull()
  })
})
