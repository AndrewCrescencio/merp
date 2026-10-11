import { createError, defineEventHandler, getRouterParam } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const tableId = getRouterParam(event, 'id')

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!tableId) {
    throw createError({ statusCode: 400, message: 'table_id_required' })
  }

  const { companyId, locationId } = auth.session

  try {
    const table = await restaurantRepository.closeTable({
      companyId,
      locationId,
      tableId,
      userId: auth.user.id,
    })
    return table
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('not occupied') || msg.includes('not found')) {
      throw createError({ statusCode: 400, message: error.message })
    }
    throw createError({ statusCode: 500, message: 'failed_to_close_table' })
  }
})
