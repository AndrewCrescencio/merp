import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { productRepository } from '~~/server/utils/auth/company/product-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'
import { sendValidationError } from '~~/server/utils/shared'

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().min(1).max(100).optional().nullable(),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  locationId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const user = requireUser(event)

  // Only owner/manager can create products
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  const body = await readBody(event)
  const validation = createProductSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_product_data')
  }

  const input = validation.data

  // Validate unitPrice is positive
  const unitPriceNum = Number.parseFloat(input.unitPrice)
  if (unitPriceNum < 0) {
    sendValidationError('invalid_unit_price')
  }

  const product = await productRepository.createProduct(companyId, user.id, {
    name: input.name,
    sku: input.sku || null,
    unitPrice: input.unitPrice,
    locationId: input.locationId,
  })

  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/products/${product.id}`)
  return product
})
