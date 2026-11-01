import { defineEventHandler, getQuery } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { kitchenTicketRepository } from '~~/server/utils/auth/company/kitchen-ticket-repository'
import { assertCompanyMember } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const auth = await requireTenant(event)
  const tenant = event.context.tenant!

  // Any member can list tickets
  await assertCompanyMember(companyId, auth.user.id)

  const query = getQuery(event)
  const stationId = query.stationId as string | undefined

  const tickets = await kitchenTicketRepository.listTickets(
    companyId,
    auth.user.id,
    tenant.locationId,
    stationId,
  )

  return { tickets }
})
