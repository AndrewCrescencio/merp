import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import { defineAuthHandler, ROLES, validateInviteInput } from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    rateLimit: 'ip',
    tenant: true,
    role: ROLES.owner,
    forbiddenMessage: 'Only company owners can invite members',
    body: validateInviteInput,
    audit: (_, { tenant, body }) => ({
      eventType: 'invite_created',
      metadata: { companyId: tenant.companyId, invitedEmail: body.email },
    }),
    created: ({ id }: { id: string }, { tenant }) =>
      `/api/v1/companies/${tenant.companyId}/invitations/${id}`,
  },
  async ({ tenant, body, user }) => {
    const { id, companyId, email, expiresAt, token } = await inviteRepository.createInvite({
      companyId: tenant.companyId,
      email: body.email,
      invitedBy: user.id,
    })
    return { id, companyId, email, expiresAt, token }
  },
)
