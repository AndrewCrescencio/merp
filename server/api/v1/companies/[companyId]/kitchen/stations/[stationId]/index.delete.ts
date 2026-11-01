import { defineEventHandler, setResponseStatus } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { kitchenStationRepository } from '~~/server/utils/auth/company/kitchen-station-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId, stationId } = event.context.params as { companyId: string; stationId: string }
  const auth = await requireTenant(event)

  // Only owner/manager can delete stations
  await assertCompanyRole(companyId, auth.user.id, ['owner', 'manager'])

  await kitchenStationRepository.deleteStation(companyId, auth.user.id, stationId)

  setResponseStatus(event, 204)
  return null
})
