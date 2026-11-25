import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import { defineAuthHandler } from '~~/server/utils/shared'

export default defineAuthHandler({ tenant: true, role: 'any' }, async ({ tenant, user }) => {
  const locations = await locationRepository.listLocations(tenant.companyId, user.id)
  return { locations }
})
