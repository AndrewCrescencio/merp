import { createError, defineEventHandler, getRouterParam } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { sendNotFoundError } from '~~/server/utils/shared/errors'
import { requireTenant } from '~~/server/utils/shared/auth-context'

export default defineEventHandler(async (event) => {
  const companyId = getRouterParam(event, 'companyId')
  if (!companyId) {
    sendNotFoundError('Company ID is required')
  }

  const auth = event.context.auth
  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const tenant = requireTenant(event)

  const company = await companyRepository.findCompanyWithLocations(tenant.companyId, auth.user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  return {
    id: company!.id,
    name: company!.name,
    cnpj: company!.cnpj,
    razaoSocial: company!.razaoSocial,
    isDeleted: company!.isDeleted,
    createdAt: company!.createdAt,
    updatedAt: company!.updatedAt,
    locations: company!.locations.map((l) => ({
      id: l.id,
      name: l.name,
      isActive: l.isActive,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
  }
})
