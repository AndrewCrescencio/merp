import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import { defineAuthHandler, validateInviteAcceptInput } from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    rateLimit: 'ip',
    body: validateInviteAcceptInput,
    audit: ({ companyId }: { companyId: string }) => ({
      eventType: 'invite_accepted',
      metadata: { companyId },
    }),
  },
  async ({ body, user }) => {
    const { id, companyId, acceptedAt } = await inviteRepository.acceptInvite(
      body.token,
      user.email,
      user.id,
    )
    return { id, companyId, acceptedAt }
  },
)
