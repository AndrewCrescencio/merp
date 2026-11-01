import { defineEventHandler, setResponseStatus } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { productRepository } from '~~/server/utils/auth/company/product-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId, productId } = event.context.params as { companyId: string; productId: string }
  const auth = await requireTenant(event)

  // Only owner/manager can delete products
  await assertCompanyRole(companyId, auth.user.id, ['owner', 'manager'])

  await productRepository.softDeleteProduct(companyId, auth.user.id, productId)

  setResponseStatus(event, 204)
  return null
})
