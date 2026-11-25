import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { defineAuthHandler } from '~~/server/utils/shared'

export default defineAuthHandler({}, async ({ user }) => {
  const companies = await membershipRepository.findUserCompanies(user.id)

  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
    })),
  }
})
