import { createError, defineEventHandler, getQuery } from 'h3'
import { orderRepository } from '~~/server/utils/order/repository'
import { z } from 'zod'

const listOrdersSchema = z.object({
  status: z.enum(['open', 'completed', 'cancelled']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const query = getQuery(event)
  const parsed = listOrdersSchema.safeParse(query)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
  }

  const { companyId } = auth.session
  const { status, limit, offset } = parsed.data

  const orders = await orderRepository.list(companyId, {
    status,
    limit,
    offset,
  })

  return { orders }
})
