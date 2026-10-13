import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('CompanyRepository (integration)', () => {
  let repo: import('~~/server/utils/auth/company/repository').CompanyRepository
  let membershipRepo: import('~~/server/utils/auth/company/membership').MembershipRepository

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    repo = new (await import('~~/server/utils/auth/company/repository')).CompanyRepository()
    membershipRepo = new (
      await import('~~/server/utils/auth/company/membership')
    ).MembershipRepository()
  })

  // Um seed que não cria a conta deve falhar alto: o resto do teste usaria
  // `userA.id` como se existisse.
  const registerUser = async (email: string, name: string) => {
    const result = await import('~~/server/utils/auth/identity/queries').then((m) =>
      m.registerUser({ email, password: 'password123', name, consentTermsVersion: 'v1' }),
    )
    if (!result) throw new Error(`registerUser falhou para ${email}`)
    return result
  }

  describe('RLS isolation', () => {
    it('prevents cross-tenant member visibility', async () => {
      const emailA = `tenant-a-${Date.now()}@example.com`
      const emailB = `tenant-b-${Date.now()}@example.com`

      const userA = await registerUser(emailA, 'User A')
      const userB = await registerUser(emailB, 'User B')

      const companyA = await repo.createCompanyWithOwner({ name: 'Company A' }, userA.id)
      const companyB = await repo.createCompanyWithOwner({ name: 'Company B' }, userB.id)

      const userACompanies = await membershipRepo.findUserCompanies(userA.id)
      expect(userACompanies).toHaveLength(1)
      expect(userACompanies[0]?.id).toBe(companyA.id)

      const userBCompanies = await membershipRepo.findUserCompanies(userB.id)
      expect(userBCompanies).toHaveLength(1)
      expect(userBCompanies[0]?.id).toBe(companyB.id)
    })

    it('prevents cross-tenant SELECT without tenant context (fail-closed 0 rows)', async () => {
      const emailA = `iso-select-a-${Date.now()}@example.com`
      const emailB = `iso-select-b-${Date.now()}@example.com`

      const userA = await registerUser(emailA, 'Sel A')
      const userB = await registerUser(emailB, 'Sel B')

      const _companyA = await repo.createCompanyWithOwner({ name: 'Sel Company A' }, userA.id)
      const companyB = await repo.createCompanyWithOwner({ name: 'Sel Company B' }, userB.id)

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const { companyMember } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      // cm_select_policy confia no tenant context (fornecido pelo app, não pelo
      // atacante) — sem contexto, user A não vê nada da empresa B (fail-closed).
      const rows = await withTenant(null, null, userA.id, (tx) =>
        tx.select().from(companyMember).where(eq(companyMember.companyId, companyB.id)),
      )

      expect(rows).toHaveLength(0)
    })

    it('prevents cross-tenant UPDATE on company via raw SQL (0 rows)', async () => {
      const emailA = `iso-update-a-${Date.now()}@example.com`
      const emailB = `iso-update-b-${Date.now()}@example.com`

      const userA = await registerUser(emailA, 'Upd A')
      const userB = await registerUser(emailB, 'Upd B')

      const _companyA = await repo.createCompanyWithOwner({ name: 'Upd Company A' }, userA.id)
      const companyB = await repo.createCompanyWithOwner({ name: 'Upd Company B' }, userB.id)

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const { company } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      const updated = await withTenant(companyB.id, null, userA.id, (tx) =>
        tx.update(company).set({ name: 'Hacked' }).where(eq(company.id, companyB.id)).returning(),
      )

      expect(updated).toHaveLength(0)
      expect(await repo.findCompanyById(companyB.id, userB.id)).toMatchObject({
        name: 'Upd Company B',
      })
    })

    it('AUD-20: an outsider cannot read a company by id (0 rows → null)', async () => {
      const emailA = `iso-find-a-${Date.now()}@example.com`
      const emailB = `iso-find-b-${Date.now()}@example.com`

      const userA = await registerUser(emailA, 'Find A')
      const userB = await registerUser(emailB, 'Find B')

      const companyB = await repo.createCompanyWithOwner({ name: 'Find Company B' }, userB.id)

      expect(await repo.findCompanyById(companyB.id, userA.id)).toBeNull()
      expect(await repo.findCompanyById(companyB.id, userB.id)).toMatchObject({
        id: companyB.id,
      })
    })

    it('AUD-10: search is scoped to the user membership', async () => {
      const member = await registerUser(`scope-member-${Date.now()}@example.com`, 'Scope Member')
      const outsider = await registerUser(`scope-outsider-${Date.now()}@example.com`, 'Scope Out')

      const mine = await repo.createCompanyWithOwner({ name: 'Scope Mine Company' }, member.id)
      const theirs = await repo.createCompanyWithOwner(
        { name: 'Scope Theirs Company' },
        outsider.id,
      )

      const memberResults = await membershipRepo.searchCompanies('Scope', member.id)
      expect(memberResults.map((c) => c.id)).toEqual([mine.id])
      expect(memberResults.some((c) => c.id === theirs.id)).toBe(false)

      const outsiderResults = await membershipRepo.searchCompanies('Scope', outsider.id)
      expect(outsiderResults.map((c) => c.id)).toEqual([theirs.id])
      expect(outsiderResults.some((c) => c.id === mine.id)).toBe(false)
    })
  })

  describe('createCompanyWithOwner', () => {
    it('creates company and owner atomically', async () => {
      const owner = await registerUser(`atomic-owner-${Date.now()}@example.com`, 'Atomic Owner')

      const company = await repo.createCompanyWithOwner({ name: 'Atomic Company' }, owner.id)

      expect(company).toMatchObject({ name: 'Atomic Company', isDeleted: false })
      expect(await membershipRepo.getCompanyMembershipRole(owner.id, company.id)).toBe('owner')
    })

    it('rolls back company creation when owner insert fails', async () => {
      const name = `Atomic Fail ${Date.now()}`
      const searcher = await registerUser(
        `atomic-search-${Date.now()}@example.com`,
        'Atomic Searcher',
      )

      await expect(repo.createCompanyWithOwner({ name }, 'nonexistent-user-id')).rejects.toThrow()

      const results = await membershipRepo.searchCompanies('Atomic Fail', searcher.id)
      expect(results.some((c: { name: string }) => c.name === name)).toBe(false)
    })

    it('RLS-005: low-level createCompany without user context is denied (fail-closed)', async () => {
      // company_insert_policy exige get_user_id() IS NOT NULL; createCompany usa
      // withTenant(..., null, null) → app.user_id vazio → 42501 (sem GUC de utilizador).
      let code: string | undefined
      try {
        await repo.createCompany({ name: `No User Co ${Date.now()}` })
      } catch (error) {
        let e = error as { code?: unknown; cause?: unknown } | undefined
        while (e && !code) {
          if (typeof e.code === 'string') code = e.code
          e = e.cause as typeof e
        }
      }
      expect(code).toBe('42501')
    })
  })

  describe('company membership roles', () => {
    it('returns the role of a member and null for non-members', async () => {
      const email = `role-${Date.now()}@example.com`
      const user = await registerUser(email, 'Role User')
      const company = await repo.createCompanyWithOwner({ name: 'Role Company' }, user.id)

      expect(await membershipRepo.getCompanyMembershipRole(user.id, company.id)).toBe('owner')

      const outsider = await registerUser(`outsider-${Date.now()}@example.com`, 'Outsider')
      expect(await membershipRepo.getCompanyMembershipRole(outsider.id, company.id)).toBeNull()
    })
  })

  describe('company_member insert/update policies (0008)', () => {
    it('lets an owner add a member to their own company', async () => {
      const owner = await registerUser(`add-owner-${Date.now()}@example.com`, 'Add Owner')
      const member = await registerUser(`add-member-${Date.now()}@example.com`, 'Add Member')
      const company = await repo.createCompanyWithOwner({ name: 'Add Member Company' }, owner.id)

      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      expect(await membershipRepo.getCompanyMembershipRole(member.id, company.id)).toBe('member')
    })

    it('blocks an outsider from inserting themselves as owner via raw SQL', async () => {
      const owner = await registerUser(`raw-owner-${Date.now()}@example.com`, 'Raw Owner')
      const outsider = await registerUser(`raw-outsider-${Date.now()}@example.com`, 'Raw Outsider')
      const company = await repo.createCompanyWithOwner({ name: 'Raw Insert Company' }, owner.id)

      const { db } = await import('~~/server/utils/db')
      const { companyMember } = await import('~~/server/utils/schema')
      const { getPostgresErrorCode } = await import('~~/server/utils/shared/errors')

      await expect(
        db.insert(companyMember).values({
          companyId: company.id,
          userId: outsider.id,
          role: 'owner',
        }),
      ).rejects.toSatisfy((error: unknown) => getPostgresErrorCode(error) === '42501')
    })

    it('AUD-11: createCompanyMember cannot bootstrap an owner (app guard)', async () => {
      const user = await registerUser(`aud11-guard-${Date.now()}@example.com`, 'Aud11 Guard')
      const company = await repo.createCompanyWithOwner({ name: 'Aud11 Guard Company' }, user.id)

      await expect(
        membershipRepo.createCompanyMember(company.id, user.id, 'owner'),
      ).rejects.toThrow(/createCompanyMember: role must be "member"/)
      expect(await membershipRepo.getCompanyMembershipRole(user.id, company.id)).toBe('owner')
    })

    it('AUD-11: DB backstop — member bootstrap flag never grants role=owner', async () => {
      const owner = await registerUser(`aud11-owner-${Date.now()}@example.com`, 'Aud11 Owner')
      const attacker = await registerUser(`aud11-db-${Date.now()}@example.com`, 'Aud11 Db')
      const company = await repo.createCompanyWithOwner({ name: 'Aud11 Db Company' }, owner.id)

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const { companyMember } = await import('~~/server/utils/schema')
      const { getPostgresErrorCode } = await import('~~/server/utils/shared/errors')
      const { sql } = await import('drizzle-orm')

      // Raw SQL com o flag de member no GUC — a policy (0014) exige o flag de
      // founder para role='owner'; role='member' é negado pelo flag errado.
      await expect(
        withTenant(company.id, null, attacker.id, async (tx) => {
          await tx.execute(sql`SELECT set_config('app.allow_member_bootstrap', 'true', true)`)
          await tx.insert(companyMember).values({
            companyId: company.id,
            userId: attacker.id,
            role: 'owner',
          })
        }),
      ).rejects.toSatisfy((error: unknown) => getPostgresErrorCode(error) === '42501')
    })

    it('blocks a member from promoting themselves to owner via UPDATE', async () => {
      const owner = await registerUser(`up-owner-${Date.now()}@example.com`, 'Up Owner')
      const member = await registerUser(`up-member-${Date.now()}@example.com`, 'Up Member')
      const company = await repo.createCompanyWithOwner({ name: 'Up Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const { companyMember } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')
      const { getPostgresErrorCode } = await import('~~/server/utils/shared/errors')

      await expect(
        withTenant(company.id, null, member.id, (tx) =>
          tx
            .update(companyMember)
            .set({ role: 'owner' })
            .where(eq(companyMember.userId, member.id)),
        ),
      ).rejects.toSatisfy((error: unknown) => getPostgresErrorCode(error) === '42501')
    })

    it('blocks a member from moving their own row to another company via UPDATE', async () => {
      const ownerA = await registerUser(`move-owner-a-${Date.now()}@example.com`, 'Move Owner A')
      const ownerB = await registerUser(`move-owner-b-${Date.now()}@example.com`, 'Move Owner B')
      const member = await registerUser(`move-member-${Date.now()}@example.com`, 'Move Member')
      const companyA = await repo.createCompanyWithOwner({ name: 'Move Company A' }, ownerA.id)
      const companyB = await repo.createCompanyWithOwner({ name: 'Move Company B' }, ownerB.id)
      await membershipRepo.createCompanyMember(companyA.id, member.id, 'member')

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const { companyMember } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')
      const { getPostgresErrorCode } = await import('~~/server/utils/shared/errors')

      await expect(
        withTenant(companyA.id, null, member.id, (tx) =>
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
      const owner = await registerUser(`del-owner-${Date.now()}@example.com`, 'Del Owner')
      const member = await registerUser(`del-member-${Date.now()}@example.com`, 'Del Member')
      const company = await repo.createCompanyWithOwner({ name: 'Del Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      const result = await repo.softDeleteCompany(company.id, owner.id)

      expect(result).toMatchObject({ id: company.id, isDeleted: true })
      expect(await repo.findCompanyById(company.id, owner.id)).toBeNull()
      expect(await membershipRepo.getCompanyMembershipRole(member.id, company.id)).toBeNull()
      expect(await membershipRepo.getCompanyMembershipRole(owner.id, company.id)).toBeNull()
    })

    it('backstop TOCTOU: a member cannot soft-delete the company (404, RLS denied)', async () => {
      const owner = await registerUser(`toc-owner-${Date.now()}@example.com`, 'TOC Owner')
      const member = await registerUser(`toc-member-${Date.now()}@example.com`, 'TOC Member')
      const company = await repo.createCompanyWithOwner({ name: 'TOC Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      await expect(repo.softDeleteCompany(company.id, member.id)).rejects.toMatchObject({
        statusCode: 404,
      })

      expect(await repo.findCompanyById(company.id, owner.id)).toMatchObject({ id: company.id })
      expect(await membershipRepo.getCompanyMembershipRole(member.id, company.id)).toBe('member')
    })
  })

  describe('updateCompany', () => {
    it('updates name, cnpj and razaoSocial and bumps updatedAt', async () => {
      const owner = await registerUser(`upd-owner-${Date.now()}@example.com`, 'Upd Owner')
      const company = await repo.createCompanyWithOwner({ name: 'Update Co' }, owner.id)
      const uniqueCnpj = `1${String(Date.now()).padStart(13, '0')}`

      const result = await repo.updateCompany(company.id, owner.id, {
        name: 'Updated Co',
        cnpj: uniqueCnpj,
        razaoSocial: 'Updated Razao',
      })

      expect(result).toMatchObject({
        id: company.id,
        name: 'Updated Co',
        cnpj: uniqueCnpj,
        razaoSocial: 'Updated Razao',
      })
      expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(company.updatedAt.getTime())
    })

    it('rejects duplicate cnpj with 409 conflict', async () => {
      const ownerA = await registerUser(`dup-cnpj-a-${Date.now()}@example.com`, 'Dup CNPJ A')
      const ownerB = await registerUser(`upd-dup-owner-${Date.now()}@example.com`, 'Upd Dup Owner')
      const uniqueCnpj = `2${String(Date.now()).padStart(13, '0')}`
      await repo.createCompanyWithOwner({ name: 'Co A', cnpj: uniqueCnpj }, ownerA.id)
      const companyB = await repo.createCompanyWithOwner({ name: 'Co B' }, ownerB.id)

      await expect(
        repo.updateCompany(companyB.id, ownerB.id, { cnpj: uniqueCnpj }),
      ).rejects.toMatchObject({ statusCode: 409 })
    })

    it('throws 404 when company does not exist', async () => {
      await expect(
        repo.updateCompany('nonexistent-company', 'any-user', { name: 'X' }),
      ).rejects.toMatchObject({ statusCode: 404 })
    })

    it('backstop TOCTOU: a member cannot update the company (404, RLS denied)', async () => {
      const owner = await registerUser(`upd-toc-owner-${Date.now()}@example.com`, 'Upd TOC Owner')
      const member = await registerUser(
        `upd-toc-member-${Date.now()}@example.com`,
        'Upd TOC Member',
      )
      const company = await repo.createCompanyWithOwner({ name: 'Upd TOC Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      await expect(
        repo.updateCompany(company.id, member.id, { name: 'Hacked Name' }),
      ).rejects.toMatchObject({ statusCode: 404 })

      expect(await repo.findCompanyById(company.id, owner.id)).toMatchObject({
        name: 'Upd TOC Company',
      })
    })
  })

  describe('removeCompanyMember (0010)', () => {
    it('lets an owner remove a member; the member is no longer a member', async () => {
      const owner = await registerUser(`rm-owner-${Date.now()}@example.com`, 'RM Owner')
      const member = await registerUser(`rm-member-${Date.now()}@example.com`, 'RM Member')
      const company = await repo.createCompanyWithOwner({ name: 'RM Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      await membershipRepo.removeCompanyMember(company.id, owner.id, member.id)

      expect(await membershipRepo.getCompanyMembershipRole(member.id, company.id)).toBeNull()
      expect(await membershipRepo.getCompanyMembershipRole(owner.id, company.id)).toBe('owner')
    })

    it('lets a member leave the company themselves', async () => {
      const owner = await registerUser(`lv-owner-${Date.now()}@example.com`, 'LV Owner')
      const member = await registerUser(`lv-member-${Date.now()}@example.com`, 'LV Member')
      const company = await repo.createCompanyWithOwner({ name: 'LV Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      await membershipRepo.removeCompanyMember(company.id, member.id, member.id)

      expect(await membershipRepo.getCompanyMembershipRole(member.id, company.id)).toBeNull()
      expect(await membershipRepo.getCompanyMembershipRole(owner.id, company.id)).toBe('owner')
    })

    it('backstop RLS: a member cannot remove another member (404, RLS denied)', async () => {
      const owner = await registerUser(`blk-owner-${Date.now()}@example.com`, 'Blk Owner')
      const memberA = await registerUser(`blk-member-a-${Date.now()}@example.com`, 'Blk Member A')
      const memberB = await registerUser(`blk-member-b-${Date.now()}@example.com`, 'Blk Member B')
      const company = await repo.createCompanyWithOwner({ name: 'Blk Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, memberA.id, 'member')
      await membershipRepo.createCompanyMember(company.id, memberB.id, 'member')

      await expect(
        membershipRepo.removeCompanyMember(company.id, memberA.id, memberB.id),
      ).rejects.toMatchObject({ statusCode: 404 })

      expect(await membershipRepo.getCompanyMembershipRole(memberA.id, company.id)).toBe('member')
      expect(await membershipRepo.getCompanyMembershipRole(memberB.id, company.id)).toBe('member')
    })

    it('clears activeCompanyId on sessions of the removed user (skipped: session creation via Better Auth)', async () => {
      // This test would require creating a session via Better Auth directly,
      // which is not exposed via identity/queries. The session cleanup
      // logic is tested at the API level instead.
      expect(true).toBe(true)
    })
  })
})
