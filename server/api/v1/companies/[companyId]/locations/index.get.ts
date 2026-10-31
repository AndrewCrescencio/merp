import { defineEventHandler } from 'h3'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import { requireTenant, sendUnauthorizedError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const { companyId } = requireTenant(event)
  const locations = await locationRepository.listLocations(companyId, user.id)
  return { locations }
})
