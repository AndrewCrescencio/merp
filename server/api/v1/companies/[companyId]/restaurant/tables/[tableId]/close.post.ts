import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import { tableOrderRepository } from '~~/server/utils/auth/company/table-order-repository'
import { sendConflictError, sendNotFoundError, sendValidationError } from '~~/server/utils/shared'

const closeTableSchema = z.object({
  cancelEmpty: z.boolean().optional(),
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
  const validation = closeTableSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_table_close_data')
  }

  const input = validation.data

  try {
    await tableOrderRepository.closeTable(companyId, user.id, locationId, tableId, {
      cancelEmpty: input.cancelEmpty ?? false,
    })

    setResponseStatus(event, 204)
    return null
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    // R8: inexistente → 404; não ocupada → estado atual impede fechar → 409.
    if (msg.includes('not found')) {
      sendNotFoundError(msg)
    }
    if (msg.includes('not occupied')) {
      sendConflictError(msg)
    }
    const err = error as { statusCode?: number; status?: number; message?: string }
    if (err.statusCode === 400 || err.status === 400) {
      sendValidationError((err.message as string) || 'failed_to_close_table')
    }
    throw error
  }
})
