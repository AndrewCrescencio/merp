import { requireTenant } from '~~/server/utils/shared/auth-context'
import { resolveLocationId } from '~~/server/utils/shared/location'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { printRepository } from '~~/server/utils/print/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const jobId = getRouterParam(event, 'jobId')

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!jobId) {
    throw createError({ statusCode: 400, message: 'job_id_required' })
  }

  const { companyId } = requireTenant(event)
  // ADR-002: location real do membro. `null` = sem location no escopo → a RLS
  // cai no escopo company pelo escape `OR get_location_id() IS NULL`.
  const locationId = await resolveLocationId(companyId, auth.user.id)

  const job = await printRepository.getJobById(companyId, locationId, jobId)

  if (!job) {
    throw createError({ statusCode: 404, message: 'print_job_not_found' })
  }

  return job
})
