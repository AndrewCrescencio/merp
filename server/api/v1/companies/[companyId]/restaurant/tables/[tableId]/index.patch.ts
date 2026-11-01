import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { restaurantTableRepository } from '~~/server/utils/auth/company/restaurant-table-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'
import { sendValidationError } from '~~/server/utils/shared'

const updateTableSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const { companyId, tableId } = event.context.params as { companyId: string; tableId: string }
  const auth = await requireTenant(event)

  // Only owner/manager can update tables
  await assertCompanyRole(companyId, auth.user.id, ['owner', 'manager'])

  const body = await readBody(event)
  const validation = updateTableSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_table_data')
  }

  const table = await restaurantTableRepository.updateTable(companyId, auth.user.id, tableId, {
    name: validation.data.name,
    capacity: validation.data.capacity,
    status: validation.data.status,
  })

  return table
})
