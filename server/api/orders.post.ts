import { createError, defineEventHandler, readBody } from 'h3'
import { orderRepository } from '#utils/order/repository'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId } = auth.session

  if (!VALID_ORDER_TYPES.includes(body.orderType)) {
    throw createError({ statusCode: 400, message: 'invalid_order_type' })
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    throw createError({ statusCode: 400, message: 'items_required' })
  }

  for (const item of body.items) {
    if (
      !item.productName ||
      !item.unitPrice ||
      !item.quantity ||
      !item.taxSnapshot ||
      !item.bomSnapshot
    ) {
      throw createError({ statusCode: 400, message: 'invalid_item_data' })
    }
  }

  try {
    const order = await orderRepository.create({
      companyId,
      locationId: body.locationId,
      orderType: body.orderType,
      customerId: body.customerId,
      partyId: body.partyId,
      createdBy: auth.user.id,
      idempotencyKey: body.idempotencyKey,
      items: body.items,
      dineIn: body.dineIn,
      takeout: body.takeout,
    })
    return order
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes('duplicate key') || error.message.includes('idempotency'))
    ) {
      throw createError({ statusCode: 409, message: 'idempotency_key_conflict' })
    }
    throw error
  }
})

const VALID_ORDER_TYPES = ['dine_in', 'takeout'] as const
