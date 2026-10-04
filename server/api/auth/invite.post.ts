import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import {
  assertCompanyRole,
  checkIpRateLimit,
  createAuthEvent,
  getClientIp,
  sendNotFoundError,
  sendUnauthorizedError,
  validateInviteInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const body = await readBody<{ companyId?: string; email?: string }>(event)
  const { companyId, email } = validateInviteInput(body)

  const company = await companyRepository.findCompanyById(companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await membershipRepository.getCompanyMembershipRole(user.id, companyId)
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can invite members',
  )

  const created = await inviteRepository.createInvite({
    companyId,
    email,
    invitedBy: user.id,
  })

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'invite_created',
    ipAddress: ip || null,
    metadata: { companyId, invitedEmail: email },
  })

  setResponseStatus(event, 201)
  return {
    id: created.id,
    companyId: created.companyId,
    email: created.email,
    expiresAt: created.expiresAt,
    token: created.token,
  }
})
