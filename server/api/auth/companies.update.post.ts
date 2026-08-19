import { defineEventHandler, readBody, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'
import {
  MAX_CNPJ_LENGTH,
  MAX_COMPANY_NAME_LENGTH,
  MAX_RAZAO_SOCIAL_LENGTH,
} from '~~/server/utils/shared/security'
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

  const body = await readBody<{
    companyId?: string
    name?: string
    cnpj?: string
    razaoSocial?: string
  }>(event)

  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const input: { name?: string; cnpj?: string; razaoSocial?: string } = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      sendValidationError('Company name must be a non-empty string')
    }
    const name = body.name.trim()
    if (name.length > MAX_COMPANY_NAME_LENGTH) {
      sendValidationError('Company name must be at most 200 characters')
    }
    input.name = name
  }
  if (body.cnpj !== undefined) {
    if (typeof body.cnpj !== 'string') {
      sendValidationError('cnpj must be a string')
    }
    const cnpj = body.cnpj.trim() || undefined
    if (cnpj && cnpj.length > MAX_CNPJ_LENGTH) {
      sendValidationError('cnpj must be at most 30 characters')
    }
    input.cnpj = cnpj
  }
  if (body.razaoSocial !== undefined) {
    if (typeof body.razaoSocial !== 'string') {
      sendValidationError('razaoSocial must be a string')
    }
    const razaoSocial = body.razaoSocial.trim() || undefined
    if (razaoSocial && razaoSocial.length > MAX_RAZAO_SOCIAL_LENGTH) {
      sendValidationError('razaoSocial must be at most 200 characters')
    }
    input.razaoSocial = razaoSocial
  }
  if (Object.keys(input).length === 0) {
    sendValidationError('At least one field (name, cnpj, razaoSocial) is required')
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
    'Only company owners can update companies',
  )

  const updated = await companyRepository.updateCompany(body.companyId, user.id, input)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'company_updated',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId },
  })

  return updated
})
