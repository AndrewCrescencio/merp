import { requireTenant } from '~~/server/utils/shared/auth-context'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { printRepository } from '~~/server/utils/print/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const jobId = getRouterParam(event, 'id')

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  if (!jobId) {
    throw createError({ statusCode: 400, message: 'job_id_required' })
  }

  const { companyId } = requireTenant(event)
  const locationId = '' // H07: sem fonte de locationId; '' → get_location_id() = NULL → RLS fail-closed

  const job = await printRepository.getJobById(companyId, locationId, jobId)

  if (!job) {
    throw createError({ statusCode: 404, message: 'print_job_not_found' })
  }

  return job
})
