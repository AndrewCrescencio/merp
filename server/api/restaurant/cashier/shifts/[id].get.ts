import { createError, defineEventHandler, getRouterParam } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const shiftId = getRouterParam(event, 'id')

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!shiftId) {
    throw createError({ statusCode: 400, message: 'shift_id_required' })
  }

  const { companyId, locationId } = auth.session

  const shift = await restaurantRepository.getCashierShift(companyId, locationId, shiftId)

  if (!shift) {
    throw createError({ statusCode: 404, message: 'cashier_shift_not_found' })
  }

  return shift
})
