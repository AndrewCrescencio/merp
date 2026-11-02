import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
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
  const { companyId } = requireTenant(event)
  const productId = getRouterParam(event, 'productId')
  if (!productId) {
    throw createError({ statusCode: 400, message: 'product_id_required' })
  }
  const user = requireUser(event)

  // Only owner/manager can update products
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

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

  const product = await productRepository.updateProduct(companyId, user.id, productId, {
    name: input.name,
    sku: input.sku,
    unitPrice: input.unitPrice,
    isActive: input.isActive,
  })

  return product
})
