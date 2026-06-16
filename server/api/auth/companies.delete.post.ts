import { defineEventHandler, readBody, createError, getRequestIP } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import {
  sendValidationError,
  sendNotFoundError,
  sendForbiddenError,
} from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ companyId?: string }>(event)

  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const company = await authRepository.findCompanyById(body.companyId)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const isMember = await authRepository.isCompanyMember(user.id, body.companyId)
  if (!isMember) {
    sendForbiddenError('You are not a member of this company')
  }

  await authRepository.softDeleteCompany(body.companyId)

  const ip = getRequestIP(event, { xForwardedFor: true })
  await authRepository.createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'company_deleted',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId },
  })

  return { message: 'Company deleted successfully' }
})
