import { recordProductMilestone } from '~~/server/utils/insights/product'
import { locationRepository } from '~~/server/utils/companies/company/location-repository'
import { defineAuthHandler, ROLES, validateLocationCreateInput } from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    tenant: true,
    role: ROLES.owner,
    forbiddenMessage: 'Only company owners can create locations',
    body: validateLocationCreateInput,
    created: ({ id }: { id: string }, { tenant }) =>
      `/api/v1/companies/${tenant.companyId}/locations/${id}`,
  },
  async ({ tenant, user, body, event }) => {
    const created = await locationRepository.createLocation(tenant.companyId, user.id, body)
    recordProductMilestone(event, 'location_created')
    return created
  },
)
