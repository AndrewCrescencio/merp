import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { assertRole, ROLES, sendNotFoundError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const { companyId, role } = requireTenant(event)
  await assertRole(
    role,
    ROLES.owner,
    'You are not a member of this company',
    'Only company owners can delete locations',
  )

  const locationId = getRouterParam(event, 'locationId')
  if (!locationId) {
    sendNotFoundError('Location not found')
  }

  await locationRepository.softDeleteLocation(companyId, user.id, locationId!)

  // R8: DELETE responde 204 sem corpo.
  return sendNoContent(event)
})
