import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('Company membership listing (integration)', () => {
  let membershipRepo: import('~~/server/utils/companies/company/membership').MembershipRepository
  let companyRepo: import('~~/server/utils/companies/company/repository').CompanyRepository

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = INTEGRATION_DB_URL
    membershipRepo = new (
      await import('~~/server/utils/companies/company/membership')
    ).MembershipRepository()
    companyRepo = new (
      await import('~~/server/utils/companies/company/repository')
    ).CompanyRepository()
  })

  const registerUser = async (email: string, name: string) => {
    const result = await import('~~/server/utils/auth/identity/queries').then((m) =>
      m.registerUser({ email, password: 'password123', name, consentTermsVersion: 'v1' }),
    )
    if (!result) throw new Error(`registerUser falhou para ${email}`)
    return result
  }

  describe('listCompanyMembers', () => {
    it('lista os membros da empresa com nomes, roles e loja padrao', async () => {
      const owner = await registerUser(`mem-owner-${Date.now()}@example.com`, 'Mem Owner')
      const member = await registerUser(`mem-user-${Date.now()}@example.com`, 'Mem User')
      const company = await companyRepo.createCompanyWithOwner({ name: 'Mem Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      const members = await membershipRepo.listCompanyMembers(company.id, owner.id)

      expect(members.map((m) => m.userId).sort()).toEqual([member.id, owner.id].sort())
      expect(members.find((m) => m.userId === owner.id)?.role).toBe('owner')
      expect(members.find((m) => m.userId === member.id)?.role).toBe('member')
    })

    it('um membro le a lista de membros da propria empresa', async () => {
      const owner = await registerUser(`mem2-owner-${Date.now()}@example.com`, 'Mem2 Owner')
      const member = await registerUser(`mem2-user-${Date.now()}@example.com`, 'Mem2 User')
      const company = await companyRepo.createCompanyWithOwner({ name: 'Mem2 Company' }, owner.id)
      await membershipRepo.createCompanyMember(company.id, member.id, 'member')

      const list = await membershipRepo.listCompanyMembers(company.id, member.id)
      expect(list.map((m) => m.userId)).toHaveLength(2)
      expect(list.map((m) => m.role).sort()).toEqual(['member', 'owner'])
    })

    it('a listagem com tenant de outra empresa nao vaza membros de fora', async () => {
      const ownerA = await registerUser(`memx-a-${Date.now()}@example.com`, 'MemX A')
      const ownerB = await registerUser(`memx-b-${Date.now()}@example.com`, 'MemX B')
      const memberB = await registerUser(`memx-b2-${Date.now()}@example.com`, 'MemX B2')
      const companyA = await companyRepo.createCompanyWithOwner(
        { name: 'MemX Company A' },
        ownerA.id,
      )
      const companyB = await companyRepo.createCompanyWithOwner(
        { name: 'MemX Company B' },
        ownerB.id,
      )
      await membershipRepo.createCompanyMember(companyB.id, memberB.id, 'member')

      // Contexto de tenant B: a listagem so pode conter membros de B.
      const listB = await membershipRepo.listCompanyMembers(companyB.id, ownerA.id)

      expect(listB.map((m) => m.userId).sort()).toEqual([memberB.id, ownerB.id].sort())
      expect(listB.some((m) => m.userId === ownerA.id)).toBe(false)

      // Contexto de tenant A: so membros de A.
      const listA = await membershipRepo.listCompanyMembers(companyA.id, ownerA.id)
      expect(listA.map((m) => m.userId)).toHaveLength(1)
      expect(listA[0]?.userId).toBe(ownerA.id)
    })
  })
})
