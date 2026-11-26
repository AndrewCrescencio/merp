import { companyRepository } from '~~/server/utils/companies/company/repository'
import { defineAuthHandler, sendNotFoundError } from '~~/server/utils/shared'

export default defineAuthHandler({ tenant: true, role: 'any' }, async ({ tenant, user }) => {
  const company = await companyRepository.findCompanyWithLocations(tenant.companyId, user.id)
  if (!company) {
    return sendNotFoundError('Company not found')
  }

  return {
    id: company.id,
    name: company.name,
    isDeleted: company.isDeleted,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    locations: company.locations.map((l) => ({
      id: l.id,
      name: l.name,
      isActive: l.isActive,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
  }
})
