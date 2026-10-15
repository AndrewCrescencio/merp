import { createError, defineEventHandler } from 'h3'
import { restaurantRepository } from '~~/server/utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId, locationId } = auth.session

  const tables = await restaurantRepository.listTables(companyId, locationId)

  return { tables }
})
