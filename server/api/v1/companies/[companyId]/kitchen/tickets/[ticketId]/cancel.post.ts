import { defineEventHandler } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { kitchenTicketRepository } from '~~/server/utils/auth/company/kitchen-ticket-repository'
import { sendValidationError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const { ticketId } = event.context.params as { companyId: string; ticketId: string }
  const auth = await requireTenant(event)

  try {
    await kitchenTicketRepository.updateStatus({
      ticketId,
      status: 'cancelled',
      userId: auth.user.id,
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
