import { defineEventHandler, readBody, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  sendValidationError,
  sendNotFoundError,
  sendForbiddenError,
} from '~~/server/utils/shared/errors'

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

  const company = await companyRepository.findCompanyById(body.companyId)
  if (!company) {
    sendNotFoundError('Company not found or deleted')
  }

  const isMember = await companyRepository.isCompanyMember(user.id, body.companyId)
  if (!isMember) {
    sendForbiddenError('User is not a member of the specified company')
  }

  await companyRepository.setActiveCompany(currentSession.id, body.companyId)

  event.context.activeCompanyId = body.companyId

  return { message: 'Active company switched' }
})
