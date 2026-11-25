import { sendNoContent } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  assertRole,
  createAuthEvent,
  getClientIp,
  defineAuthHandler,
  requireTenant,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  // companyId vem do path (middleware tenant); DELETE não tem body.
  const { companyId, role } = requireTenant(event)

  assertRole(
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

  // DELETE responde 204 sem corpo.
  return sendNoContent(event)
})
