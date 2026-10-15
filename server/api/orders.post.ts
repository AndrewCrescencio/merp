import { createError, defineEventHandler, readBody } from 'h3'
import { orderRepository } from '~~/server/utils/order/repository'
import { z } from 'zod'

const createOrderSchema = z
  .object({
    orderType: z.enum(['dine_in', 'takeout']),
    customerId: z.string().uuid().optional(),
    partyId: z.string().uuid().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid().optional(),
          productName: z.string().min(1),
          unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
          quantity: z.string().regex(/^\d+(\.\d{1,3})?$/),
          taxSnapshot: z.string(),
          bomSnapshot: z.string().optional(),
          discountApplied: z.string().optional(),
        }),
      )
      .min(1),
    dineIn: z
      .object({
        tableId: z.string().uuid(),
        coverCount: z.number().int().positive().optional(),
        waiterId: z.string().uuid().optional(),
      })
      .optional(),
    takeout: z
      .object({
        pickupAt: z.string().datetime().optional(),
        pickupName: z.string().optional(),
        pickupPhone: z.string().optional(),
      })
      .optional(),
    idempotencyKey: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.orderType === 'dine_in') return !!data.dineIn
      if (data.orderType === 'takeout') return !!data.takeout
      return true
    },
    {
      message: 'dine_in required for dine_in orderType, takeout required for takeout orderType',
      path: ['dineIn'],
    },
  )

export default defineEventHandler(async (event) => {
  const auth = event.context.auth

  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'unauthenticated' })
  }

  const body = await readBody(event)
  const parsed = createOrderSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'validation_error',
      data: parsed.error.flatten(),
    })
  }

  const input = parsed.data
  const { companyId, locationId } = auth.session

  try {
    const order = await orderRepository.create({
      companyId,
      locationId,
      orderType: input.orderType,
      customerId: input.customerId,
      partyId: input.partyId,
      createdBy: auth.user.id,
      idempotencyKey: input.idempotencyKey,
      items: input.items.map((item) => ({
        ...item,
        bomSnapshot: item.bomSnapshot ?? '',
      })),
      dineIn: input.dineIn,
      takeout: input.takeout
        ? {
            ...input.takeout,
            pickupAt: input.takeout.pickupAt ? new Date(input.takeout.pickupAt) : undefined,
          }
        : undefined,
    })

    return order
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('duplicate') || msg.includes('unique')) {
      throw createError({ statusCode: 409, message: 'idempotency_conflict' })
    }
    if (msg.includes('not found')) {
      throw createError({ statusCode: 404, message: 'not found' })
    }
    throw createError({ statusCode: 500, message: 'failed_to_create_order' })
  }
})
