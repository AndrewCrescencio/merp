import { createError, defineEventHandler, readBody } from 'h3'
import { printRepository } from '#utils/print/repository'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId, locationId } = auth.session

  const { printerId, orderId, template, payload, priority } = body

  if (!orderId || !template || !payload) {
    throw createError({ statusCode: 400, message: 'missing_required_fields' })
  }

  if (!['receipt', 'kitchen-ticket'].includes(template)) {
    throw createError({ statusCode: 400, message: 'invalid_template' })
  }

  try {
    const job = await printRepository.enqueuePrintJob({
      companyId,
      locationId,
      printerId,
      orderId,
      template,
      payload,
      priority,
    })
    return job
  } catch (error: any) {
    if (error.message.includes('No default printer')) {
      throw createError({ statusCode: 400, message: error.message })
    }
    throw createError({ statusCode: 500, message: 'print_job_enqueue_failed' })
  }
})
