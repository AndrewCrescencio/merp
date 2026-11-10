import { defineEventHandler } from 'h3'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { companyId } = requireTenant(event)
  const locations = await locationRepository.listLocations(companyId, user.id)
  return { locations }
})
