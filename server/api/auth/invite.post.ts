import { defineEventHandler, readBody, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import {
  sendValidationError,
  sendNotFoundError,
  assertCompanyRole,
} from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'
import { normalizeEmail } from '~~/server/utils/shared/security'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ companyId?: string; email?: string }>(event)

  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    sendValidationError('A valid email is required')
  }

  const company = await companyRepository.findCompanyById(body.companyId)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await companyRepository.getCompanyMembershipRole(user.id, body.companyId)
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can invite members',
  )

  const created = await inviteRepository.createInvite({
    companyId: body.companyId,
    email: email!,
    invitedBy: user.id,
  })

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'invite_created',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId, invitedEmail: email },
  })

  return {
    id: created.id,
    companyId: created.companyId,
    email: created.email,
    expiresAt: created.expiresAt,
  }
})
