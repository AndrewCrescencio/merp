import { defineEventHandler, getQuery } from 'h3'
import { restaurantRepository } from '#utils/restaurant/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    return createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const query = getQuery(event)
  const { companyId, locationId } = auth.session

  const shifts = await restaurantRepository.listCashierShifts(companyId, locationId, {
    status: query.status as string,
    userId: query.userId as string,
    limit: query.limit ? Number(query.limit) : 50,
  })

  return shifts
})
