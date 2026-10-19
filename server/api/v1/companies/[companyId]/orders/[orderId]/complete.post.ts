import { requireTenant } from '~~/server/utils/shared/auth-context'
import { sendConflictError, sendNotFoundError } from '~~/server/utils/shared'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { orderRepository } from '~~/server/utils/order/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const orderId = getRouterParam(event, 'orderId')

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!orderId) {
    throw createError({ statusCode: 400, message: 'order_id_required' })
  }

  const { companyId } = requireTenant(event)

  try {
    const order = await orderRepository.complete(companyId, orderId)
    if (!order) {
      sendNotFoundError('order_not_found')
    }
    return order
  } catch (error: unknown) {
    // R8: estado atual impede a transição → 409 (conflito), não 400.
    if (error instanceof Error && error.message.includes('Cannot complete')) {
      sendConflictError(error.message)
    }
    throw error
  }
})
