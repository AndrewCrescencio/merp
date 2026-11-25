import { getRouterParam } from 'h3'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import {
  defineAuthHandler,
  ROLES,
  sendNotFoundError,
  validateLocationUpdateInput,
} from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    tenant: true,
    role: ROLES.owner,
    forbiddenMessage: 'Only company owners can update locations',
    body: validateLocationUpdateInput,
  },
  ({ event, tenant, user, body }) => {
    const locationId = getRouterParam(event, 'locationId')
    if (!locationId) sendNotFoundError('Location not found')
    return locationRepository.updateLocation(tenant.companyId, user.id, locationId, body)
  },
)
