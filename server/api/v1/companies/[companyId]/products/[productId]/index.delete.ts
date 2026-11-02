import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { productRepository } from '~~/server/utils/auth/company/product-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = requireTenant(event)
  const productId = getRouterParam(event, 'productId')
  if (!productId) {
    throw createError({ statusCode: 400, message: 'product_id_required' })
  }
  const user = requireUser(event)

  // Only owner/manager can delete products
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  await productRepository.softDeleteProduct(companyId, user.id, productId)

  setResponseStatus(event, 204)
  return null
})
