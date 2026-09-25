import { defineEventHandler, readBody } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  sendForbiddenError,
  sendNotFoundError,
  sendUnauthorizedError,
  validateCompanySwitchInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  const currentSession = event.context.session as { id: string } | undefined
  if (!user || !currentSession) {
    sendUnauthorizedError('Authentication required.')
  }

  const { companyId } = validateCompanySwitchInput(await readBody(event))

  const company = await companyRepository.findCompanyById(companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found or deleted')
  }

  const isMember = await companyRepository.isCompanyMember(user.id, companyId)
  if (!isMember) {
    sendForbiddenError('User is not a member of the specified company')
  }

  await companyRepository.setActiveCompany(currentSession.id, companyId, user.id)

  event.context.activeCompanyId = companyId

  return { message: 'Active company switched' }
})
