import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import { requireTenant, sendUnauthorizedError } from '~~/server/utils/shared'
import { assertRole, sendNotFoundError } from '~~/server/utils/shared/errors'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const { companyId, role } = requireTenant(event)
  await assertRole(
    role,
    'owner',
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
