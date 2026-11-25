import { readBody, setHeader, setResponseStatus } from 'h3'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import {
  assertRole,
  checkIpRateLimit,
  createAuthEvent,
  getClientIp,
  defineAuthHandler,
  validateInviteInput,
  requireTenant,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  await checkIpRateLimit(event)

  // companyId vem do path (middleware tenant), nunca do body.
  const { companyId, role } = requireTenant(event)
  const { email } = validateInviteInput(await readBody(event))

  assertRole(
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
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/invitations/${created.id}`)
  return {
    id: created.id,
    companyId: created.companyId,
    email: created.email,
    expiresAt: created.expiresAt,
    token: created.token,
  }
})
