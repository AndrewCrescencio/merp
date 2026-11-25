import { getRouterParam, readBody } from 'h3'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import {
  assertRole,
  defineAuthHandler,
  ROLES,
  requireTenant,
  sendNotFoundError,
  validateLocationUpdateInput,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const { companyId, role } = requireTenant(event)
  assertRole(
    role,
    ROLES.owner,
    'You are not a member of this company',
    'Only company owners can update locations',
  )

  const locationId = getRouterParam(event, 'locationId')
  if (!locationId) {
    sendNotFoundError('Location not found')
  }

  const input = validateLocationUpdateInput(await readBody(event))
  return await locationRepository.updateLocation(companyId, user.id, locationId!, input)
})
