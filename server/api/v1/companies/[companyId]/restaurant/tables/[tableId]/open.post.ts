import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { tableOrderRepository } from '~~/server/utils/auth/company/table-order-repository'
import { sendValidationError } from '~~/server/utils/shared'

const openTableSchema = z.object({
  coverCount: z.number().int().min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const params = event.context.params as { companyId?: string; tableId?: string }
  const { companyId, tableId } = params
  if (!companyId || !tableId) {
    throw { statusCode: 404, message: 'Not found' }
  }

  const auth = await requireTenant(event)
  const tenant = event.context.tenant!

  const body = await readBody(event)
  const validation = openTableSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_table_open_data')
  }

  const input = validation.data

  try {
    const order = await tableOrderRepository.openTable(companyId, auth.user.id, tenant.locationId, {
      tableId,
      coverCount: input.coverCount ?? 1,
    })

    setResponseStatus(event, 201)
    setHeader(event, 'Location', `/api/v1/companies/${companyId}/orders/${order.id}`)
    return order
  } catch (error: unknown) {
    const err = error as { statusCode?: number; status?: number; message?: string }
    if (err.statusCode === 400 || err.status === 400) {
      sendValidationError((err.message as string) || 'failed_to_open_table')
    }
    throw error
  }
})
