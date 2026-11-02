import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { restaurantTableRepository } from '~~/server/utils/auth/company/restaurant-table-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'
import { sendValidationError } from '~~/server/utils/shared'

const createTableSchema = z.object({
  number: z.number().int().positive(),
  name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().min(1).optional(),
  locationId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const user = requireUser(event)

  // Only owner/manager can create tables
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  const body = await readBody(event)
  const validation = createTableSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_table_data')
  }

  const input = validation.data

  const table = await restaurantTableRepository.createTable(companyId, user.id, input.locationId, {
    companyId,
    locationId: input.locationId,
    number: input.number,
    name: input.name,
    capacity: input.capacity,
  })

  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/restaurant/tables/${table.id}`)
  return table
})
