import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { restaurantTableRepository } from '~~/server/utils/auth/company/restaurant-table-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = requireTenant(event)
  const tableId = getRouterParam(event, 'tableId')
  if (!tableId) {
    throw createError({ statusCode: 400, message: 'table_id_required' })
  }
  const user = requireUser(event)

  // Only owner/manager can delete tables
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  await restaurantTableRepository.deleteTable(companyId, user.id, tableId)

  setResponseStatus(event, 204)
  return null
})
