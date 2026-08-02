import { defineEventHandler, readBody, createError, getRequestIP } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import {
  sendValidationError,
  sendNotFoundError,
  assertCompanyRole,
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

  const role = await authRepository.getCompanyMembershipRole(user.id, body.companyId)
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can delete companies',
  )

  await authRepository.softDeleteCompany(body.companyId, user.id)

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
