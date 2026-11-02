import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import { tableOrderRepository } from '~~/server/utils/auth/company/table-order-repository'
import { sendValidationError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const orderId = getRouterParam(event, 'orderId')
  const itemId = getRouterParam(event, 'itemId')
  if (!orderId || !itemId) {
    throw createError({ statusCode: 400, message: 'order_item_required' })
  }
  const user = requireUser(event)
  const locationId = await requireLocationId(companyId, user.id)

  try {
    await tableOrderRepository.removeItemFromOrder(companyId, user.id, locationId, orderId, itemId)

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
