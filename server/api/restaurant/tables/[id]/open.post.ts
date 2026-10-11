import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const tableId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!tableId) {
    throw createError({ statusCode: 400, message: 'table_id_required' })
  }

  const { companyId, locationId } = auth.session

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
  } catch (error: any) {
    if (error.message.includes('not available') || error.message.includes('not found')) {
      throw createError({ statusCode: 400, message: error.message })
    }
    throw createError({ statusCode: 500, message: 'failed_to_open_table' })
  }
})
