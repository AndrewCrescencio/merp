import { requireTenant } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import { createError, defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { sendValidationError } from '~~/server/utils/shared'
import { printRepository } from '~~/server/utils/print/repository'
import { z } from 'zod'

const enqueuePrintJobSchema = z.object({
  printerId: z.string().uuid().optional(),
  orderId: z.string().uuid(),
  template: z.enum(['receipt', 'kitchen-ticket']),
  payload: z.record(z.string(), z.unknown()),
  priority: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const body = await readBody(event)
  const parsed = enqueuePrintJobSchema.safeParse(body)

  if (!parsed.success) {
    sendValidationError('validation_error')
  }

  const { companyId } = requireTenant(event)
  // ADR-002: location real do membro. `null` = sem location no escopo → a RLS
  // cai no escopo company pelo escape `OR get_location_id() IS NULL`.
  const locationId = await requireLocationId(companyId, auth.user.id)

  try {
    const job = await printRepository.enqueuePrintJob({
      companyId,
      locationId,
      ...parsed.data,
    })

    // R8: criação → 201 + Location do recurso criado.
    setResponseStatus(event, 201)
    setHeader(event, 'Location', `/api/v1/companies/${companyId}/print/jobs/${job.id}`)
    return job
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('No default printer')) {
      sendValidationError(msg)
    }
    throw createError({ statusCode: 500, message: 'failed_to_enqueue_print_job' })
  }
})
