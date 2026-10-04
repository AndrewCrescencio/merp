import { describe, it, expect, beforeAll } from 'vitest'

const _INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('InviteRepository (integration)', () => {
  let repo: import('~~/server/utils/auth/invite/repository').InviteRepository
  let company: import('~~/server/utils/auth/company/repository').CompanyRepository
  let membershipRepo: import('~~/server/utils/auth/company/membership').MembershipRepository
  let _identity: import('~~/server/utils/auth/identity/repository').IdentityRepository

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    repo = new (await import('~~/server/utils/auth/invite/repository')).InviteRepository()
    company = new (await import('~~/server/utils/auth/company/repository')).CompanyRepository()
    membershipRepo = new (
      await import('~~/server/utils/auth/company/membership')
    ).MembershipRepository()
  })

  const registerUser = (email: string, name: string) =>
    import('~~/server/utils/auth/identity/queries').then((m) =>
      m.registerUser({ email, password: 'password123', name }),
    )

  it('creates, lists, finds and accepts an invite by token', async () => {
    const ownerEmail = `owner-${Date.now()}@example.com`
    const inviteeEmail = `invitee-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Owner')
    const invitee = await registerUser(inviteeEmail, 'Invitee')
    const createdCompany = await company.createCompanyWithOwner(
      { name: 'Invite Company' },
      owner.id,
    )

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: inviteeEmail,
      invitedBy: owner.id,
    })
    expect(created).toMatchObject({ companyId: createdCompany.id, email: inviteeEmail })
    expect(created.token).toBeTruthy()
    // AUD-01: hash nunca sai do repositório — o que segue para a API é só o token
    expect(created).not.toHaveProperty('tokenHash')
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now())

    const pending = await repo.findPendingInvite(createdCompany.id, inviteeEmail)
    expect(pending?.id).toBe(created.id)

    const listed = await repo.listCompanyInvites(createdCompany.id)
    expect(listed.map((i: { id: string }) => i.id)).toContain(created.id)

    const accepted = await repo.acceptInvite(created.token, inviteeEmail, invitee.id)
    expect(accepted.acceptedAt).toBeInstanceOf(Date)

    expect(await repo.findPendingInvite(createdCompany.id, inviteeEmail)).toBeNull()
    expect(await membershipRepo.isCompanyMember(invitee.id, createdCompany.id)).toBe(true)
    expect(await membershipRepo.getCompanyMembershipRole(invitee.id, createdCompany.id)).toBe(
      'member',
    )
  })

  it('rejects duplicate invites for the same company and email', async () => {
    const ownerEmail = `dupowner-${Date.now()}@example.com`
    const inviteeEmail = `dupinvitee-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Dup Owner')
    const createdCompany = await company.createCompanyWithOwner({ name: 'Dup Company' }, owner.id)

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
    const createdCompany = await company.createCompanyWithOwner({ name: 'Exp Company' }, owner.id)

    const { withTenant } = await import('~~/server/utils/db/tenant-context')
    const { invite } = await import('~~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: `expired-${Date.now()}@example.com`,
      invitedBy: owner.id,
    })

    await withTenant(createdCompany.id, null, owner.id, async (tx) => {
      await tx
        .update(invite)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(invite.id, created.id))
    })

    // AUD-01: token expirado também não aceita
    await expect(repo.acceptInvite(created.token, created.email, owner.id)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('is single-use: a consumed token cannot be accepted again', async () => {
    const ownerEmail = `oneowner-${Date.now()}@example.com`
    const inviteeEmail = `oneinvitee-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'One Owner')
    const invitee = await registerUser(inviteeEmail, 'One Invitee')
    const createdCompany = await company.createCompanyWithOwner({ name: 'One Company' }, owner.id)

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: inviteeEmail,
      invitedBy: owner.id,
    })

    await repo.acceptInvite(created.token, inviteeEmail, invitee.id)
    await expect(repo.acceptInvite(created.token, inviteeEmail, invitee.id)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('rejects a token presented by a different email (posse do token + email da sessão)', async () => {
    const ownerEmail = `diffowner-${Date.now()}@example.com`
    const inviteeEmail = `diffinvitee-${Date.now()}@example.com`
    const otherEmail = `other-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Diff Owner')
    const _invitee = await registerUser(inviteeEmail, 'Diff Invitee')
    const other = await registerUser(otherEmail, 'Other User')
    const createdCompany = await company.createCompanyWithOwner({ name: 'Diff Company' }, owner.id)

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: inviteeEmail,
      invitedBy: owner.id,
    })

    await expect(repo.acceptInvite(created.token, otherEmail, other.id)).rejects.toMatchObject({
      statusCode: 404,
    })

    // o convite segue válido para o destinatário certo
    const pending = await repo.findPendingInvite(createdCompany.id, inviteeEmail)
    expect(pending?.id).toBe(created.id)
    expect(await membershipRepo.isCompanyMember(other.id, createdCompany.id)).toBe(false)
  })

  it('rejects a forged token (nothing matches an unknown hash)', async () => {
    const ownerEmail = `forgedowner-${Date.now()}@example.com`
    const inviteeEmail = `forgedinvitee-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Forged Owner')
    const invitee = await registerUser(inviteeEmail, 'Forged Invitee')
    const createdCompany = await company.createCompanyWithOwner(
      { name: 'Forged Company' },
      owner.id,
    )

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: inviteeEmail,
      invitedBy: owner.id,
    })

    await expect(
      repo.acceptInvite(`${created.token}x`, inviteeEmail, invitee.id),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('RLS backstop: direct member self-insert without token or bootstrap flag is denied', async () => {
    // AUD-01: mesmo que o check de app fosse removido, a policy cm_insert_policy
    // nega o self-insert sem token_hash válido (não setamos o flag de bootstrap).
    const ownerEmail = `rlsowner-${Date.now()}@example.com`
    const attackerEmail = `rlsattacker-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Rls Owner')
    const attacker = await registerUser(attackerEmail, 'Rls Attacker')
    const createdCompany = await company.createCompanyWithOwner({ name: 'Rls Company' }, owner.id)

    const { withTenant } = await import('~~/server/utils/db/tenant-context')
    const { companyMember } = await import('~~/server/utils/schema')

    await expect(
      withTenant(createdCompany.id, null, attacker.id, async (tx) => {
        await tx.insert(companyMember).values({
          companyId: createdCompany.id,
          userId: attacker.id,
          role: 'member',
        })
      }),
    ).rejects.toThrow()

    expect(await membershipRepo.isCompanyMember(attacker.id, createdCompany.id)).toBe(false)
  })

  it('RLS backstop: member (non-owner) cannot UPDATE invites in the company', async () => {
    // AUD-01 residual: a policy antiga (invite_update_policy sem check de role)
    // deixava qualquer member alterar invites pendentes. Agora o UPDATE exige
    // owner OU o claim por token — member sem token é negado no banco.
    const ownerEmail = `updowner-${Date.now()}@example.com`
    const memberEmail = `updmember-${Date.now()}@example.com`
    const inviteeEmail = `updinvitee-${Date.now()}@example.com`
    const owner = await registerUser(ownerEmail, 'Upd Owner')
    const member = await registerUser(memberEmail, 'Upd Member')
    const createdCompany = await company.createCompanyWithOwner({ name: 'Upd Company' }, owner.id)
    await membershipRepo.createCompanyMember(createdCompany.id, member.id, 'member')

    const created = await repo.createInvite({
      companyId: createdCompany.id,
      email: inviteeEmail,
      invitedBy: owner.id,
    })

    const { withTenant } = await import('~~/server/utils/db/tenant-context')
    const { invite } = await import('~~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    // RLS de UPDATE filtra silenciosamente (0 rows) — o member não vê erro,
    // mas a linha não muda; o invite continua intacto para o destinatário.
    const hijackedEmail = `hijack-${Date.now()}@example.com`
    const rows = await withTenant(createdCompany.id, null, member.id, async (tx) => {
      return tx
        .update(invite)
        .set({ email: hijackedEmail })
        .where(eq(invite.id, created.id))
        .returning({ id: invite.id })
    })
    expect(rows).toHaveLength(0)

    const pending = await repo.findPendingInvite(createdCompany.id, inviteeEmail)
    expect(pending?.id).toBe(created.id)
    expect(pending?.email).not.toBe(hijackedEmail)
  })
})
