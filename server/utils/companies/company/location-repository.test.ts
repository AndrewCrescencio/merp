import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('LocationRepository (integration)', () => {
  let locationRepo: import('~~/server/utils/companies/company/location-repository').LocationRepository
  let companyRepo: import('~~/server/utils/companies/company/repository').CompanyRepository
  let membershipRepo: import('~~/server/utils/companies/company/membership').MembershipRepository

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    locationRepo = new (
      await import('~~/server/utils/companies/company/location-repository')
    ).LocationRepository()
    companyRepo = new (
      await import('~~/server/utils/companies/company/repository')
    ).CompanyRepository()
    membershipRepo = new (
      await import('~~/server/utils/companies/company/membership')
    ).MembershipRepository()
  })

  const registerUser = async (email: string, name: string) => {
    const result = await import('~~/server/utils/auth/identity/queries').then((m) =>
      m.registerUser({ email, password: 'password123', name, consentTermsVersion: 'v1' }),
    )
    if (!result) throw new Error(`registerUser falhou para ${email}`)
    return result
  }

  describe('leitura e escrita de locations da propria empresa', () => {
    it('remove a associação padrão quando o local fica inativo e rejeita nova associação', async () => {
      const owner = await registerUser(`loc-inactive-owner-${Date.now()}@example.com`, 'Owner')
      const member = await registerUser(`loc-inactive-member-${Date.now()}@example.com`, 'Member')
      const company = await companyRepo.createCompanyWithOwner(
        { name: 'Inactive Company' },
        owner.id,
      )
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')
      const location = await locationRepo.createLocation(company.id, owner.id, { name: 'Branch' })

      await membershipRepo.setMemberDefaultLocation(company.id, owner.id, member.id, location.id)
      await locationRepo.softDeleteLocation(company.id, owner.id, location.id)

      await expect(
        membershipRepo.setMemberDefaultLocation(company.id, owner.id, member.id, location.id),
      ).rejects.toMatchObject({ statusCode: 404 })
      const details = await membershipRepo.getCompanyMembershipWithDetails(member.id, company.id)
      expect(details?.defaultLocationId).toBeNull()
    })

    it('o owner lista e cria locations da sua empresa', async () => {
      const owner = await registerUser(`loc-owner-${Date.now()}@example.com`, 'Loc Owner')
      const company = await companyRepo.createCompanyWithOwner({ name: 'Loc Company' }, owner.id)

      const loc1 = await locationRepo.createLocation(company.id, owner.id, {
        name: 'Sede',
      })
      const loc2 = await locationRepo.createLocation(company.id, owner.id, {
        name: 'Filial',
      })

      const list = await locationRepo.listLocations(company.id, owner.id)
      // A criacao de company bootstraps a location 'Principal'.
      expect(list.map((l) => l.name).sort()).toEqual(['Filial', 'Principal', 'Sede'])
      expect(loc1.isActive).toBe(true)
      expect(loc2.isActive).toBe(true)
    })

    it('qualquer membro da empresa le as locations dela', async () => {
      const owner = await registerUser(`loc-mem-owner-${Date.now()}@example.com`, 'Mem Owner')
      const member = await registerUser(`loc-mem-${Date.now()}@example.com`, 'Mem Member')
      const company = await companyRepo.createCompanyWithOwner({ name: 'Mem Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')
      await locationRepo.createLocation(company.id, owner.id, { name: 'Sede' })

      const list = await locationRepo.listLocations(company.id, member.id)
      expect(list.map((l) => l.name)).toContain('Sede')
    })
  })

  describe('isolamento entre tenants (RLS via withTenant)', () => {
    it('sem contexto de tenant nao le locations de nenhum tenant (fail-closed)', async () => {
      const userA = await registerUser(`iso-sel-a-${Date.now()}@example.com`, 'Sel A')
      const userB = await registerUser(`iso-sel-b-${Date.now()}@example.com`, 'Sel B')
      const companyB = await companyRepo.createCompanyWithOwner({ name: 'Sel Company B' }, userB.id)
      await locationRepo.createLocation(companyB.id, userB.id, { name: 'Loc B' })

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const { location } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      const rows = await withTenant({ companyId: null, locationId: null, userId: userA.id }, (tx) =>
        tx.select().from(location).where(eq(location.companyId, companyB.id)),
      )

      expect(rows).toHaveLength(0)
    })

    it('contexto de tenant B nao alcança location da empresa A (0 rows no UPDATE)', async () => {
      const userA = await registerUser(`iso-upd-a-${Date.now()}@example.com`, 'Upd A')
      const userB = await registerUser(`iso-upd-b-${Date.now()}@example.com`, 'Upd B')
      const companyA = await companyRepo.createCompanyWithOwner({ name: 'Upd Company A' }, userA.id)
      const companyB = await companyRepo.createCompanyWithOwner({ name: 'Upd Company B' }, userB.id)
      const locB = await locationRepo.createLocation(companyB.id, userB.id, {
        name: 'Loc B',
      })

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const { location } = await import('~~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      // userA com tenant=companyA tenta alterar a location de B: o GUC do
      // contexto eh de outra empresa -> RLS nega (0 rows). O isolamento eh
      // por empresa no GUC, nao por usuario na policy de location.
      const updated = await withTenant(
        { companyId: companyA.id, locationId: null, userId: userA.id },
        (tx) =>
          tx.update(location).set({ name: 'Hacked' }).where(eq(location.id, locB.id)).returning(),
      )

      expect(updated).toHaveLength(0)
      // A location 'Principal' eh bootstrapped na criacao da company B.
      const intact = await locationRepo.listLocations(companyB.id, userB.id)
      expect(intact.map((l) => l.name).sort()).toEqual(['Loc B', 'Principal'])
    })

    it('repository: edicao de location de outro tenant com tenant A retorna 404', async () => {
      const userA = await registerUser(`iso-repo-a-${Date.now()}@example.com`, 'Repo A')
      const userB = await registerUser(`iso-repo-b-${Date.now()}@example.com`, 'Repo B')
      const companyA = await companyRepo.createCompanyWithOwner(
        { name: 'Repo Company A' },
        userA.id,
      )
      const companyB = await companyRepo.createCompanyWithOwner(
        { name: 'Repo Company B' },
        userB.id,
      )
      const locB = await locationRepo.createLocation(companyB.id, userB.id, {
        name: 'Loc B',
      })

      // O tenant de A nao enxerga a linha de B (company_id diferente do GUC).
      await expect(
        locationRepo.updateLocation(companyA.id, userA.id, locB.id, {
          name: 'Hacked',
        }),
      ).rejects.toMatchObject({ statusCode: 404 })

      await expect(
        locationRepo.softDeleteLocation(companyA.id, userA.id, locB.id),
      ).rejects.toMatchObject({ statusCode: 404 })

      const intact = await locationRepo.listLocations(companyB.id, userB.id)
      expect(intact.map((l) => l.name).sort()).toEqual(['Loc B', 'Principal'])
    })

    it('repository dentro de uma transação preserva o escopo do chamador', async () => {
      const userA = await registerUser(`inherit-a-${Date.now()}@example.com`, 'Inherit A')
      const userB = await registerUser(`inherit-b-${Date.now()}@example.com`, 'Inherit B')
      const companyA = await companyRepo.createCompanyWithOwner(
        { name: 'Inherited Scope A' },
        userA.id,
      )
      const companyB = await companyRepo.createCompanyWithOwner(
        { name: 'Inherited Scope B' },
        userB.id,
      )

      const { withTenant } = await import('~~/server/utils/db/tenant-context')
      const rows = await withTenant(
        { companyId: companyA.id, locationId: null, userId: userA.id },
        (tx) => locationRepo.listLocations(companyB.id, userB.id, tx),
      )

      expect(rows).toEqual([])
    })
  })
})
