import { describe, it, expect, beforeAll } from 'vitest'

const INTEGRATION_DB_URL = 'postgres://merp:merp@localhost:5432/merp_test'
const testEmail = `test-${Date.now()}@example.com`
const testPassword = 'test-password-123'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('DrizzleAuthRepository (integration)', () => {
  let repo: any

  beforeAll(async () => {
    process.env.DATABASE_URL = INTEGRATION_DB_URL
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
})
