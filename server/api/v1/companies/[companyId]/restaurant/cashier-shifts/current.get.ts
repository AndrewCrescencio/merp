import { requireTenant } from '~~/server/utils/shared/auth-context'
import { createError, defineEventHandler } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId } = requireTenant(event)
  const locationId = '' // H07: sem fonte de locationId; '' → get_location_id() = NULL → RLS fail-closed

  const shift = await restaurantRepository.getCurrentUserShift(companyId, locationId, auth.user.id)

  if (!shift) {
    throw createError({ statusCode: 404, message: 'no_open_shift' })
  }

  return shift
})
