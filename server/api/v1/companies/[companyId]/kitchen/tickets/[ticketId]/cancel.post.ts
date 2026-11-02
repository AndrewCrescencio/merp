import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { kitchenTicketRepository } from '~~/server/utils/auth/company/kitchen-ticket-repository'
import { sendValidationError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const ticketId = getRouterParam(event, 'ticketId')
  if (!ticketId) {
    throw createError({ statusCode: 400, message: 'ticket_id_required' })
  }
  const user = requireUser(event)

  try {
    await kitchenTicketRepository.updateStatus({
      ticketId,
      status: 'cancelled',
      userId: user.id,
    })

    setResponseStatus(event, 204)
    return null
  } catch (error: unknown) {
    const err = error as { statusCode?: number; status?: number; message?: string }
    if (err.statusCode === 400 || err.status === 400) {
      sendValidationError((err.message as string) || 'failed_to_cancel_ticket')
    }
    throw error
  }
})
