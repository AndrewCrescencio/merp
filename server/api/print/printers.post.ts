import { createError, defineEventHandler, readBody } from 'h3'
import { printRepository } from '~~/server/utils/print/repository'
import { z } from 'zod'

const registerPrinterSchema = z.object({
  name: z.string().min(1).max(100),
  driver: z.enum(['escpos', 'star', 'epson', 'custom']),
  connection: z.object({
    type: z.enum(['network', 'usb', 'bluetooth']),
    host: z.string().optional(),
    port: z.number().int().positive().optional(),
    mac: z.string().optional(),
    path: z.string().optional(),
  }),
  stationIds: z.array(z.string().uuid()).min(1),
  isActive: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const body = await readBody(event)
  const parsed = registerPrinterSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
  }

  const { companyId, locationId } = auth.session

  try {
    const printer = await printRepository.registerPrinter({
      companyId,
      locationId,
      ...parsed.data,
    })

    return printer
  } catch (error: any) {
    throw createError({ statusCode: 500, message: 'failed_to_register_printer' })
  }
})