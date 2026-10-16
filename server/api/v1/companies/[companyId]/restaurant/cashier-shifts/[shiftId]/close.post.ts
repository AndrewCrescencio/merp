import { requireTenant } from '~~/server/utils/shared/auth-context'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  // shiftId vem do PATH, nunca do body (R1/R5).
  const shiftId = getRouterParam(event, 'shiftId')
  const body = await readBody(event)

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { closingFloat, expectedAmount, actualAmount, notes } = body

  if (!shiftId || !closingFloat || !expectedAmount || !actualAmount) {
    throw createError({ statusCode: 400, message: 'missing_required_fields' })
  }

  const { companyId } = requireTenant(event)
  const locationId = '' // H07: sem fonte de locationId; '' → get_location_id() = NULL → RLS fail-closed

  try {
    const shift = await restaurantRepository.closeCashierShift({
      companyId,
      locationId,
      shiftId,
      userId: auth.user.id,
      closingFloat,
      expectedAmount,
      actualAmount,
      notes,
    })

    if (!shift) {
      throw createError({ statusCode: 404, message: 'cashier_shift_not_found' })
    }

    return shift
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('not open') || msg.includes('not found')) {
      throw createError({ statusCode: 400, message: msg })
    }
    throw createError({ statusCode: 500, message: 'failed_to_close_cashier_shift' })
  }
})
