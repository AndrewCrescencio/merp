import {
  createError,
  defineEventHandler,
  getRouterParam,
  readBody,
  setHeader,
  setResponseStatus,
} from 'h3'
import { z } from 'zod'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { requireLocationId } from '~~/server/utils/shared/location'
import { tableOrderRepository } from '~~/server/utils/auth/company/table-order-repository'
import { sendValidationError } from '~~/server/utils/shared'

const addItemSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(1).max(255),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  quantity: z.string().regex(/^\d+(\.\d{1,3})?$/),
  taxSnapshot: z.string().min(1),
  bomSnapshot: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { companyId } = requireTenant(event)
  const orderId = getRouterParam(event, 'orderId')
  if (!orderId) {
    throw createError({ statusCode: 400, message: 'order_id_required' })
  }
  const user = requireUser(event)
  const locationId = await requireLocationId(companyId, user.id)

  const body = await readBody(event)
  const validation = addItemSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_order_item_data')
  }

  const input = validation.data

  // Validate unitPrice is positive
  const unitPriceNum = Number.parseFloat(input.unitPrice)
  if (unitPriceNum < 0) {
    sendValidationError('invalid_unit_price')
  }

  const item = await tableOrderRepository.addItemToOrder(companyId, user.id, locationId, orderId, {
    productId: input.productId || undefined,
    productName: input.productName,
    unitPrice: input.unitPrice,
    quantity: input.quantity,
    taxSnapshot: input.taxSnapshot,
    bomSnapshot: input.bomSnapshot,
  })

  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/orders/${orderId}/items/${item.id}`)
  return { success: true, item }
})
