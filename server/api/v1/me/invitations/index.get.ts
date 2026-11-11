import { getQuery } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import {
  assertRole,
  defineAuthHandler,
  sendNotFoundError,
  sendValidationError,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const query = getQuery<{ companyId?: string }>(event)

  if (!query?.companyId || typeof query.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const company = await companyRepository.findCompanyById(query.companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await membershipRepository.getCompanyMembershipRole(user.id, query.companyId)
  await assertRole(role, null, 'You are not a member of this company')

  const invites = await inviteRepository.listCompanyInvites(query.companyId)

  return { invites }
})
