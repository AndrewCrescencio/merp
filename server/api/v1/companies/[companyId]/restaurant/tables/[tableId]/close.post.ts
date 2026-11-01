import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { tableOrderRepository } from '~~/server/utils/auth/company/table-order-repository'
import { sendValidationError } from '~~/server/utils/shared'

const closeTableSchema = z.object({
  cancelEmpty: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { companyId, tableId } = event.context.params as { companyId: string; tableId: string }
  const auth = await requireTenant(event)
  const tenant = event.context.tenant!

  const body = await readBody(event)
  const validation = closeTableSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_table_close_data')
  }

  const input = validation.data

  try {
    await tableOrderRepository.closeTable(companyId, auth.user.id, tenant.locationId, tableId, {
      cancelEmpty: input.cancelEmpty ?? false,
    })

    setResponseStatus(event, 204)
    return null
  } catch (error: unknown) {
    const err = error as { statusCode?: number; status?: number; message?: string }
    if (err.statusCode === 400 || err.status === 400) {
      sendValidationError((err.message as string) || 'failed_to_close_table')
    }
    throw error
  }
})
