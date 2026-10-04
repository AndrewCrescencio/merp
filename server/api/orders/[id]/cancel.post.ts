import { createError, defineEventHandler, getRouterParam } from 'h3'
import { orderRepository } from '#utils/auth/order/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const orderId = getRouterParam(event, 'id')

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!orderId) {
    throw createError({ statusCode: 400, message: 'order_id_required' })
  }

  const { companyId } = auth.session

  try {
    const order = await orderRepository.cancel(companyId, orderId)
    if (!order) {
      throw createError({ statusCode: 404, message: 'order_not_found' })
    }
    return order
  } catch (error: any) {
    if (error.message.includes('Cannot cancel')) {
      throw createError({ statusCode: 400, message: error.message })
    }
    throw error
  }
})
