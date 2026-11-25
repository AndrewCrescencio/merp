import { locationRepository } from '~~/server/utils/auth/company/location-repository'
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
  ({ tenant, user, body }) => locationRepository.createLocation(tenant.companyId, user.id, body),
)
