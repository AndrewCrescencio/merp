import { defineEventHandler, readBody } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  assertCompanyRole,
  createAuthEvent,
  getClientIp,
  isValidCnpj,
  sendNotFoundError,
  sendUnauthorizedError,
  sendValidationError,
  validateCompanyUpdateInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const body = await readBody<{
    companyId?: string
    name?: string
    cnpj?: string
    razaoSocial?: string
  }>(event)

  const input = validateCompanyUpdateInput(body)

  if (input.cnpj && !isValidCnpj(input.cnpj)) {
    sendValidationError('cnpj is invalid')
  }

  const company = await companyRepository.findCompanyById(body.companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await companyRepository.getCompanyMembershipRole(user.id, body.companyId)
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can update companies',
  )

  const updated = await companyRepository.updateCompany(body.companyId, user.id, input)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'company_updated',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId },
  })

  return updated
})
