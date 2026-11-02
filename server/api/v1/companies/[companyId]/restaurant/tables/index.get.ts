import { defineEventHandler, getQuery } from 'h3'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { restaurantTableRepository } from '~~/server/utils/auth/company/restaurant-table-repository'
import { assertCompanyMember } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = requireTenant(event)
  const user = requireUser(event)

  // Any member can list tables
  await assertCompanyMember(companyId, user.id)

  const query = getQuery(event)
  const locationId = query.locationId as string | undefined

  const tables = await restaurantTableRepository.listTables(companyId, user.id, locationId)

  return { tables }
})
