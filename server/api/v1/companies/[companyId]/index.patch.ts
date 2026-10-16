import { defineEventHandler, readBody } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  assertCompanyRole,
  createAuthEvent,
  getClientIp,
  isValidCnpj,
  sendUnauthorizedError,
  sendValidationError,
  validateCompanyUpdateInput,
  requireTenant,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // companyId vem do path (middleware tenant), nunca do body (R1/R5).
  const { companyId, role } = requireTenant(event)

  const input = validateCompanyUpdateInput(await readBody(event))

  if (input.cnpj && !isValidCnpj(input.cnpj)) {
    sendValidationError('cnpj is invalid')
  }

  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can update companies',
  )

  const updated = await companyRepository.updateCompany(companyId, user.id, input)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'company_updated',
    ipAddress: ip || null,
    metadata: { companyId },
  })

  return updated
})
