import { defineEventHandler, getQuery } from 'h3'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { kitchenTicketRepository } from '~~/server/utils/auth/company/kitchen-ticket-repository'
import { assertCompanyMember } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = requireTenant(event)
  const user = requireUser(event)

  // Any member can list tickets
  await assertCompanyMember(companyId, user.id)

  const query = getQuery(event)
  const locationId = query.locationId as string | undefined
  const stationId = query.stationId as string | undefined

  const tickets = await kitchenTicketRepository.listTickets(
    companyId,
    user.id,
    locationId,
    stationId,
  )

  return { tickets }
})
