import { requireTenant } from '~~/server/utils/shared/auth-context'
import { sendNotFoundError } from '~~/server/utils/shared'
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

  const job = await printRepository.retryJob(companyId, jobId)

  if (!job) {
    sendNotFoundError('print_job_not_found')
  }

  return job
})
