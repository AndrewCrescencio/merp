import { readBody } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  assertRole,
  createAuthEvent,
  getClientIp,
  defineAuthHandler,
  requireTenant,
  validateCompanyUpdateInput,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  // companyId vem do path (middleware tenant), nunca do body.
  const { companyId, role } = requireTenant(event)

  const input = validateCompanyUpdateInput(await readBody(event))

  await assertRole(
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
