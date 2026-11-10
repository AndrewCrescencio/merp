import { companyRepository } from '~~/server/utils/auth/company/repository'
import { defineAuthHandler, requireTenant, sendNotFoundError } from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const tenant = requireTenant(event)

  const company = await companyRepository.findCompanyWithLocations(tenant.companyId, user.id)
  if (!company) {
    return sendNotFoundError('Company not found')
  }

  return {
    id: company.id,
    name: company.name,
    cnpj: company.cnpj,
    razaoSocial: company.razaoSocial,
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
