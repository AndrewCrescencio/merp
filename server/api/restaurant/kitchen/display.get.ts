import { createError, defineEventHandler, getQuery } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'
import { z } from 'zod'

const displayQuerySchema = z.object({
  stationId: z.string().uuid(),
  status: z.enum(['pending', 'in_progress', 'ready']).optional(),
})

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const query = getQuery(event)
  const parsed = displayQuerySchema.safeParse(query)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
  }

  const { companyId, locationId } = auth.session
  const { stationId, status } = parsed.data

  const tickets = await restaurantRepository.listKitchenTickets(companyId, locationId, { status, limit: 100 })

  const stationTickets = tickets.filter((t: any) => t.stationId === stationId)

  const formatted = stationTickets.map((t: any) => ({
    id: t.id,
    orderId: t.orderId,
    productName: t.items?.[0]?.productName || 'Unknown',
    quantity: t.items?.[0]?.quantity || '1',
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
  }))

  return { tickets: formatted }
})