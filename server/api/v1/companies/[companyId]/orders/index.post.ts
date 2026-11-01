import { requireTenant } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import {
  createError,
  defineEventHandler,
  getHeader,
  readBody,
  setHeader,
  setResponseStatus,
} from 'h3'
import { sendConflictError, sendNotFoundError, sendValidationError } from '~~/server/utils/shared'
import { orderFingerprint, orderRepository } from '~~/server/utils/order/repository'
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
    // Alias depreciado do header `Idempotency-Key`; o header tem prioridade.
    idempotencyKey: z.string().min(1).max(255).optional(),
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
    sendValidationError('validation_error')
  }

  const input = parsed.data
  const { companyId } = requireTenant(event)
  // ADR-002: location real do membro. `null` = sem location no escopo → a RLS
  // cai no escopo company pelo escape `OR get_location_id() IS NULL`.
  const locationId = await requireLocationId(companyId, auth.user.id)

  // Header é o contrato (R4/R8); o body fica como alias temporário.
  const headerKey = getHeader(event, 'idempotency-key')?.trim()
  const idempotencyKey = headerKey || input.idempotencyKey
  if (idempotencyKey && idempotencyKey.length > 255) {
    sendValidationError('invalid_idempotency_key')
  }

  const createInput = {
    companyId,
    locationId,
    orderType: input.orderType,
    customerId: input.customerId,
    partyId: input.partyId,
    createdBy: auth.user.id,
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
  }

  try {
    const order = await orderRepository.create({
      ...createInput,
      idempotencyKey,
      idempotencyFingerprint: idempotencyKey ? orderFingerprint(createInput) : undefined,
    })

    // R8: criação → 201 + Location do recurso criado (replay devolve o original).
    setResponseStatus(event, 201)
    setHeader(event, 'Location', `/api/v1/companies/${companyId}/orders/${order.id}`)
    return order
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('idempotency_mismatch')) {
      sendConflictError('idempotency_conflict')
    }
    if (msg.includes('not found')) {
      sendNotFoundError('not found')
    }
    throw createError({ statusCode: 500, message: 'failed_to_create_order' })
  }
})
