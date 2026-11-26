import { getRouterParam, sendNoContent } from 'h3'
import { locationRepository } from '~~/server/utils/companies/company/location-repository'
import { defineAuthHandler, ROLES, sendNotFoundError } from '~~/server/utils/shared'

export default defineAuthHandler(
  { tenant: true, role: ROLES.owner, forbiddenMessage: 'Only company owners can delete locations' },
  async ({ event, tenant, user }) => {
    const locationId = getRouterParam(event, 'locationId')
    if (!locationId) sendNotFoundError('Location not found')

    await locationRepository.softDeleteLocation(tenant.companyId, user.id, locationId)
    return sendNoContent(event)
  },
)
