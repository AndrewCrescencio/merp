import { defineEventHandler, readBody } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import {
  assertCompanyRole,
  createAuthEvent,
  getClientIp,
  sendNotFoundError,
  sendUnauthorizedError,
  validateDeleteCompanyInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const { companyId } = validateDeleteCompanyInput(await readBody(event))

  const company = await companyRepository.findCompanyById(companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await membershipRepository.getCompanyMembershipRole(user.id, companyId)
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can delete companies',
  )

  await companyRepository.softDeleteCompany(companyId, user.id)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'company_deleted',
    ipAddress: ip || null,
    metadata: { companyId },
  })

  return { message: 'Company deleted successfully' }
})
