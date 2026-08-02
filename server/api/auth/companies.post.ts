import { defineEventHandler, readBody, createError } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import { sendValidationError } from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ name?: string; cnpj?: string; razaoSocial?: string }>(event)

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Company name is required')
  }

  const created = await authRepository.createCompanyWithOwner(
    {
      name: body.name.trim(),
      cnpj: body.cnpj?.trim() || undefined,
      razaoSocial: body.razaoSocial?.trim() || undefined,
    },
    user.id,
  )

  return {
    id: created.id,
    name: created.name,
  }
})
