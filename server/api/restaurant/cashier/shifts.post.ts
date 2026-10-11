import { createError, defineEventHandler, readBody } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const body = await readBody(event)

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { openingFloat } = body

  if (!openingFloat) {
    throw createError({ statusCode: 400, message: 'opening_float_required' })
  }

  const { companyId, locationId } = auth.session

  try {
    const shift = await restaurantRepository.openCashierShift({
      companyId,
      locationId,
      userId: auth.user.id,
      openingFloat,
    })
    return shift
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('already has an open shift')) {
      throw createError({ statusCode: 400, message: msg })
    }
    throw createError({ statusCode: 500, message: 'failed_to_open_cashier_shift' })
  }
})
