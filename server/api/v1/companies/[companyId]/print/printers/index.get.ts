import { requireTenant } from '~~/server/utils/shared/auth-context'
import { createError, defineEventHandler } from 'h3'
import { printRepository } from '~~/server/utils/print/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId } = requireTenant(event)
  const locationId = '' // H07: sem fonte de locationId; '' → get_location_id() = NULL → RLS fail-closed

  const printers = await printRepository.getPrinters(companyId, locationId)

  return { printers }
})
