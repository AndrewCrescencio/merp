import { defineEventHandler, readBody, createError } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import {
  sendValidationError,
  sendNotFoundError,
  sendForbiddenError,
} from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  const currentSession = event.context.session as { id: string } | undefined
  if (!user || !currentSession) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ companyId?: string }>(event)

  if (!body.companyId || typeof body.companyId !== 'string') {
    sendValidationError('Company ID is required')
  }

  const company = await authRepository.findCompanyById(body.companyId)
  if (!company) {
    sendNotFoundError('Company not found or deleted')
  }

  const isMember = await authRepository.isCompanyMember(user.id, body.companyId)
  if (!isMember) {
    sendForbiddenError('User is not a member of the specified company')
  }

  await authRepository.setActiveCompany(currentSession.id, body.companyId)

  event.context.activeCompanyId = body.companyId

  return { message: 'Active company switched' }
})
