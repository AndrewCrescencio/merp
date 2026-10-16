import { requireTenant } from '~~/server/utils/shared/auth-context'
import { resolveLocationId } from '~~/server/utils/shared/location'
import { createError, defineEventHandler } from 'h3'
import { printRepository } from '~~/server/utils/print/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId } = requireTenant(event)
  // ADR-002: location real do membro. `null` = sem location no escopo → a RLS
  // cai no escopo company pelo escape `OR get_location_id() IS NULL`.
  const locationId = await resolveLocationId(companyId, auth.user.id)

  const printers = await printRepository.getPrinters(companyId, locationId)

  return { printers }
})
