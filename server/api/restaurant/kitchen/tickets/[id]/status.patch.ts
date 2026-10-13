import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const ticketId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!ticketId) {
    throw createError({ statusCode: 400, message: 'ticket_id_required' })
  }

  const { status } = body

  if (!status || !['pending', 'in_progress', 'ready', 'served', 'cancelled'].includes(status)) {
    throw createError({ statusCode: 400, message: 'invalid_status' })
  }

  const { companyId, locationId } = auth.session

  let ticket
  try {
    ticket = await restaurantRepository.updateKitchenTicketStatus({
      companyId,
      locationId,
      ticketId,
      status,
      userId: auth.user.id,
    })
  } catch (error) {
    // FSM: transição inválida = 422 (specs/packs/restaurant/spec.md).
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('Cannot transition')) {
      throw createError({ statusCode: 422, message: msg })
    }
    throw createError({ statusCode: 500, message: 'failed_to_update_kitchen_ticket' })
  }

  if (!ticket) {
    throw createError({ statusCode: 404, message: 'kitchen_ticket_not_found' })
  }

  return ticket
})
