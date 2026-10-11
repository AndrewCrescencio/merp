import { createError, defineEventHandler } from 'h3'
import { printRepository } from '~~/server/utils/print/repository'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId, locationId } = auth.session

  const printers = await printRepository.getPrinters(companyId, locationId)

  return { printers }
})