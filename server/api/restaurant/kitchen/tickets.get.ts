import { createError, defineEventHandler, getQuery } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'
import { z } from 'zod'

const listTicketsSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'ready', 'served', 'cancelled']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const query = getQuery(event)
  const parsed = listTicketsSchema.safeParse(query)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
  }

  const { companyId, locationId } = auth.session
  const { status, limit, offset } = parsed.data

  const tickets = await restaurantRepository.listKitchenTickets(companyId, locationId, { status, limit, offset })

  return { tickets }
})