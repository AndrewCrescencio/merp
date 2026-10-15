import { createError, defineEventHandler, getQuery } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'
import { z } from 'zod'

const listShiftsSchema = z.object({
  status: z.enum(['open', 'closed', 'reconciled', 'discrepancy']).optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const query = getQuery(event)
  const parsed = listShiftsSchema.safeParse(query)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
  }

  const { companyId, locationId } = auth.session
  const { status, userId, limit, offset } = parsed.data

  const shifts = await restaurantRepository.listCashierShifts(companyId, locationId, {
    status,
    userId,
    limit,
    offset,
  })

  return { shifts }
})
