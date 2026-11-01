import { defineEventHandler, getQuery } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { kitchenStationRepository } from '~~/server/utils/auth/company/kitchen-station-repository'
import { assertCompanyMember } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const auth = await requireTenant(event)

  // Any member can list stations
  await assertCompanyMember(companyId, auth.user.id)

  const query = getQuery(event)
  const locationId = query.locationId as string | undefined

  const stations = await kitchenStationRepository.listStations(companyId, auth.user.id, locationId)

  return { stations }
})
