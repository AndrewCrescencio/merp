import { requireTenant } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import { createError, defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { sendConflictError, sendValidationError } from '~~/server/utils/shared'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const body = await readBody(event)

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { openingFloat } = body

  if (!openingFloat) {
    sendValidationError('opening_float_required')
  }

  const { companyId } = requireTenant(event)
  // ADR-002: location real do membro. `null` = sem location no escopo → a RLS
  // cai no escopo company pelo escape `OR get_location_id() IS NULL`.
  const locationId = await requireLocationId(companyId, auth.user.id)

  try {
    const shift = await restaurantRepository.openCashierShift({
      companyId,
      locationId,
      userId: auth.user.id,
      openingFloat,
    })
    // R8: criação → 201 + Location; turno aberto pendurante → 409.
    setResponseStatus(event, 201)
    setHeader(
      event,
      'Location',
      `/api/v1/companies/${companyId}/restaurant/cashier-shifts/${shift.id}`,
    )
    return shift
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('already has an open shift')) {
      sendConflictError(msg)
    }
    throw createError({ statusCode: 500, message: 'failed_to_open_cashier_shift' })
  }
})
