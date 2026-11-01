import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { productRepository } from '~~/server/utils/auth/company/product-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'
import { sendValidationError } from '~~/server/utils/shared'

const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sku: z.string().min(1).max(100).optional().nullable(),
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  isActive: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { companyId, productId } = event.context.params as { companyId: string; productId: string }
  const auth = await requireTenant(event)

  // Only owner/manager can update products
  await assertCompanyRole(companyId, auth.user.id, ['owner', 'manager'])

  const body = await readBody(event)
  const validation = updateProductSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_product_data')
  }

  const input = validation.data

  // Validate unitPrice is positive if provided
  if (input.unitPrice !== undefined) {
    const unitPriceNum = Number.parseFloat(input.unitPrice)
    if (unitPriceNum < 0) {
      sendValidationError('invalid_unit_price')
    }
  }

  const product = await productRepository.updateProduct(companyId, auth.user.id, productId, {
    name: input.name,
    sku: input.sku,
    unitPrice: input.unitPrice,
    isActive: input.isActive,
  })

  return product
})
