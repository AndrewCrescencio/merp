import { createError, defineEventHandler, readBody } from 'h3'
import { printRepository } from '#utils/print/repository'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const { companyId, locationId } = auth.session

  const { name, type, connectionType, connectionConfig, isDefault } = body

  if (!name || !type || !connectionType || !connectionConfig) {
    throw createError({ statusCode: 400, message: 'missing_required_fields' })
  }

  if (!['receipt', 'kitchen', 'label'].includes(type)) {
    throw createError({ statusCode: 400, message: 'invalid_printer_type' })
  }

  if (!['network', 'usb', 'bluetooth'].includes(connectionType)) {
    throw createError({ statusCode: 400, message: 'invalid_connection_type' })
  }

  try {
    const printer = await printRepository.registerPrinter({
      companyId,
      locationId,
      name,
      type,
      connectionType,
      connectionConfig,
      isDefault,
    })
    return printer
  } catch (error: any) {
    throw createError({ statusCode: 500, message: 'printer_registration_failed' })
  }
})
