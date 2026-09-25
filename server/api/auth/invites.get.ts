import { defineEventHandler, getQuery } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import {
  assertCompanyRole,
  sendNotFoundError,
  sendUnauthorizedError,
  sendValidationError,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const query = getQuery<{ companyId?: string }>(event)

  if (!query?.companyId || typeof query.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const company = await companyRepository.findCompanyById(query.companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await companyRepository.getCompanyMembershipRole(user.id, query.companyId)
  await assertCompanyRole(role, null, 'You are not a member of this company')

  const invites = await inviteRepository.listCompanyInvites(query.companyId)

  return { invites }
})
