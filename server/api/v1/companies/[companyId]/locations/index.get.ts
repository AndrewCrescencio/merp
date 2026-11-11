import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import { defineAuthHandler, requireTenant } from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const { companyId } = requireTenant(event)
  const locations = await locationRepository.listLocations(companyId, user.id)
  return { locations }
})
