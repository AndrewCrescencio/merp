import { requireTenant } from '~~/server/utils/shared/auth-context'
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
  const order = await orderRepository.getById(companyId, orderId)

  if (!order) {
    throw createError({ statusCode: 404, message: 'order_not_found' })
  }

  return order
})
