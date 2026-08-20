import { defineEventHandler, readBody, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'
import {
  sendValidationError,
  sendNotFoundError,
  assertCompanyRole,
} from '~~/server/utils/shared/errors'

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

  const company = await companyRepository.findCompanyById(body.companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await companyRepository.getCompanyMembershipRole(user.id, body.companyId)
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can delete companies',
  )

  await companyRepository.softDeleteCompany(body.companyId, user.id)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'company_deleted',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId },
  })

  return { message: 'Company deleted successfully' }
})
