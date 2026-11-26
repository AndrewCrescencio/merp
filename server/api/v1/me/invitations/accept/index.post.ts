import { recordProductMilestone } from '~~/server/utils/insights/product'
import { inviteRepository } from '~~/server/utils/companies/invite/repository'
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
  async ({ body, event, user }) => {
    const { id, companyId, acceptedAt } = await inviteRepository.acceptInvite(
      body.token,
      user.email,
      user.id,
    )
    recordProductMilestone(event, 'invite_accepted')
    return { id, companyId, acceptedAt }
  },
)
