import { defineEventHandler, getQuery } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { restaurantTableRepository } from '~~/server/utils/auth/company/restaurant-table-repository'
import { assertCompanyMember } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const auth = await requireTenant(event)

  // Any member can list tables
  await assertCompanyMember(companyId, auth.user.id)

  const query = getQuery(event)
  const locationId = query.locationId as string | undefined

  const tables = await restaurantTableRepository.listTables(companyId, auth.user.id, locationId)

  return { tables }
})
