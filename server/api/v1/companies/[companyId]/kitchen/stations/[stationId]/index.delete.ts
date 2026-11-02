import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { kitchenStationRepository } from '~~/server/utils/auth/company/kitchen-station-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const stationId = getRouterParam(event, 'stationId')
  if (!stationId) {
    throw createError({ statusCode: 400, message: 'station_id_required' })
  }
  const user = requireUser(event)

  // Only owner/manager can delete stations
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  await kitchenStationRepository.deleteStation(companyId, user.id, stationId)

  setResponseStatus(event, 204)
  return null
})
