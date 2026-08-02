import { defineEventHandler, getQuery, createError } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import {
  sendValidationError,
  sendNotFoundError,
  assertCompanyRole,
} from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const query = getQuery<{ companyId?: string }>(event)

  if (!query?.companyId || typeof query.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const company = await authRepository.findCompanyById(query.companyId)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await authRepository.getCompanyMembershipRole(user.id, query.companyId)
  await assertCompanyRole(role, null, 'You are not a member of this company')

  const invites = await authRepository.listCompanyInvites(query.companyId)

  return { invites }
})
