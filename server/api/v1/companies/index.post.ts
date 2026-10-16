import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  checkIpRateLimit,
  isValidCnpj,
  sendUnauthorizedError,
  sendValidationError,
  validateCompanyCreateInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const user = event.context.user as { id: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const body = await readBody<{ name?: string; cnpj?: string; razaoSocial?: string }>(event)
  const { name, cnpj, razaoSocial } = validateCompanyCreateInput(body)

  if (cnpj && !isValidCnpj(cnpj)) {
    sendValidationError('cnpj is invalid')
  }

  const created = await companyRepository.createCompanyWithOwner(
    { name, cnpj, razaoSocial },
    user.id,
  )

  setResponseStatus(event, 201)
  return { id: created.id, name: created.name }
})
