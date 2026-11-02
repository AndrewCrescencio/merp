import { defineEventHandler, getRouterParam, readBody, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import { tableOrderRepository } from '~~/server/utils/auth/company/table-order-repository'
import { sendConflictError, sendNotFoundError, sendValidationError } from '~~/server/utils/shared'

const openTableSchema = z.object({
  coverCount: z.number().int().min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const params = event.context.params as { companyId?: string; tableId?: string }
  const { companyId } = params
  const tableId = getRouterParam(event, 'tableId')
  if (!companyId || !tableId) {
    throw { statusCode: 404, message: 'Not found' }
  }

  const user = requireUser(event)
  const locationId = await requireLocationId(companyId, user.id)

  const body = await readBody(event)
  const validation = openTableSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_table_open_data')
  }

  const input = validation.data

  try {
    const order = await tableOrderRepository.openTable(companyId, user.id, locationId, {
      tableId,
      coverCount: input.coverCount ?? 1,
    })

    setResponseStatus(event, 201)
    setHeader(event, 'Location', `/api/v1/companies/${companyId}/orders/${order.id}`)
    return order
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    // R8: inexistente → 404; ocupada → estado atual impede abrir → 409.
    if (msg.includes('not found')) {
      sendNotFoundError(msg)
    }
    if (msg.includes('not available')) {
      sendConflictError(msg)
    }
    const err = error as { statusCode?: number; status?: number; message?: string }
    if (err.statusCode === 400 || err.status === 400) {
      sendValidationError((err.message as string) || 'failed_to_open_table')
    }
    throw error
  }
})
