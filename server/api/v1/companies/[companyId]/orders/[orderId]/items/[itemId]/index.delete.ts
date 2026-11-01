import { defineEventHandler, setResponseStatus } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { tableOrderRepository } from '~~/server/utils/auth/company/table-order-repository'
import { sendValidationError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const { companyId, orderId, itemId } = event.context.params as {
    companyId: string
    orderId: string
    itemId: string
  }
  const auth = await requireTenant(event)
  const tenant = event.context.tenant!

  try {
    await tableOrderRepository.removeItemFromOrder(
      companyId,
      auth.user.id,
      tenant.locationId,
      orderId,
      itemId,
    )

    setResponseStatus(event, 204)
    return null
  } catch (error: unknown) {
    const err = error as { statusCode?: number; status?: number; message?: string }
    if (err.statusCode === 400 || err.status === 400) {
      sendValidationError((err.message as string) || 'failed_to_remove_item')
    }
    throw error
  }
})
