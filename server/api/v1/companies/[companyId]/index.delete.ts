import { defineEventHandler } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  assertCompanyRole,
  createAuthEvent,
  getClientIp,
  sendUnauthorizedError,
  requireTenant,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // companyId vem do path (middleware tenant); DELETE não tem body (R3).
  const { companyId, role } = requireTenant(event)

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
