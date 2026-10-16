import { requireTenant } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import { createError, defineEventHandler, readBody } from 'h3'
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
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
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

    return job
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('No default printer')) {
      throw createError({ statusCode: 400, message: msg })
    }
    throw createError({ statusCode: 500, message: 'failed_to_enqueue_print_job' })
  }
})
