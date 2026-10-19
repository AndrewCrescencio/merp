import { requireTenant } from '~~/server/utils/shared/auth-context'
import { sendConflictError, sendNotFoundError } from '~~/server/utils/shared'
import { requireLocationId } from '~~/server/utils/shared/location'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const tableId = getRouterParam(event, 'tableId')
  const body = await readBody(event)

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!tableId) {
    throw createError({ statusCode: 400, message: 'table_id_required' })
  }

  const { companyId } = requireTenant(event)
  // ADR-002: location real do membro. `null` = sem location no escopo → a RLS
  // cai no escopo company pelo escape `OR get_location_id() IS NULL`.
  const locationId = await requireLocationId(companyId, auth.user.id)

  try {
    const table = await restaurantRepository.openTable({
      companyId,
      locationId,
      tableId,
      waiterId: body.waiterId,
      coverCount: body.coverCount,
      userId: auth.user.id,
    })
    return table
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    // R8: inexistente → 404; ocupada → estado atual impede abrir → 409.
    if (msg.includes('not found')) {
      sendNotFoundError(msg)
    }
    if (msg.includes('not available')) {
      sendConflictError(msg)
    }
    throw createError({ statusCode: 500, message: 'failed_to_open_table' })
  }
})
