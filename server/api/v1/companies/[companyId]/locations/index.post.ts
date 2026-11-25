import { readBody, setHeader, setResponseStatus } from 'h3'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import {
  assertRole,
  defineAuthHandler,
  ROLES,
  requireTenant,
  validateLocationCreateInput,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const { companyId, role } = requireTenant(event)
  assertRole(
    role,
    ROLES.owner,
    'You are not a member of this company',
    'Only company owners can create locations',
  )

  const input = validateLocationCreateInput(await readBody(event))

  const location = await locationRepository.createLocation(companyId, user.id, input)

  // criação → 201 + Location do recurso criado.
  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/locations/${location.id}`)
  return location
})
