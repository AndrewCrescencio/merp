import { defineEventHandler, readBody, createError } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import { sendValidationError, sendNotFoundError } from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
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

  await authRepository.createCompanyMember(body.companyId, user.id, 'member')

  return { message: 'Joined company successfully' }
})
