import { defineEventHandler, setResponseStatus } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { restaurantTableRepository } from '~~/server/utils/auth/company/restaurant-table-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId, tableId } = event.context.params as { companyId: string; tableId: string }
  const auth = await requireTenant(event)

  // Only owner/manager can delete tables
  await assertCompanyRole(companyId, auth.user.id, ['owner', 'manager'])

  await restaurantTableRepository.deleteTable(companyId, auth.user.id, tableId)

  setResponseStatus(event, 204)
  return null
})
