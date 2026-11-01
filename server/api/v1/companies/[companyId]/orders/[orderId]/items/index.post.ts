import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requireTenant } from '~~/server/utils/shared/auth-context'
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
  const { companyId, orderId } = event.context.params as { companyId: string; orderId: string }
  const auth = await requireTenant(event)
  const tenant = event.context.tenant!

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

  await tableOrderRepository.addItemToOrder(companyId, auth.user.id, tenant.locationId, orderId, {
    productId: input.productId || undefined,
    productName: input.productName,
    unitPrice: input.unitPrice,
    quantity: input.quantity,
    taxSnapshot: input.taxSnapshot,
    bomSnapshot: input.bomSnapshot,
  })

  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/orders/${orderId}/items`)
  return { success: true, orderId }
})
