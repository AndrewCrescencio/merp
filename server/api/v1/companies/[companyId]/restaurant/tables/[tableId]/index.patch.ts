import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { restaurantTableRepository } from '~~/server/utils/auth/company/restaurant-table-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'
import { sendValidationError } from '~~/server/utils/shared'

const updateTableSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const { companyId } = requireTenant(event)
  const tableId = getRouterParam(event, 'tableId')
  if (!tableId) {
    throw createError({ statusCode: 400, message: 'table_id_required' })
  }
  const user = requireUser(event)

  // Only owner/manager can update tables
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  const body = await readBody(event)
  const validation = updateTableSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_table_data')
  }

  const table = await restaurantTableRepository.updateTable(companyId, user.id, tableId, {
    name: validation.data.name,
    capacity: validation.data.capacity,
    status: validation.data.status,
  })

  return table
})
