import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { orderRepository } from '~~/server/utils/order/repository'
import { z } from 'zod'

const updateStatusSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
})

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const orderId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const parsed = updateStatusSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
  }

  if (!orderId) {
    throw createError({ statusCode: 400, message: 'order_id_required' })
  }

  const { companyId, locationId: _locationId } = auth.session

  try {
    let order
    if (parsed.data.status === 'completed') {
      order = await orderRepository.complete(companyId, orderId)
    } else if (parsed.data.status === 'cancelled') {
      order = await orderRepository.cancel(companyId, orderId)
    } else {
      throw createError({ statusCode: 400, message: 'invalid_status' })
    }

    if (!order) {
      throw createError({ statusCode: 404, message: 'order_not_found' })
    }

    return order
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('not found')) {
      throw createError({ statusCode: 404, message: 'order_not_found' })
    }
    if (msg.includes('Cannot')) {
      throw createError({ statusCode: 400, message: msg })
    }
    throw createError({ statusCode: 500, message: 'failed_to_update_order_status' })
  }
})