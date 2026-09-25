import { defineEventHandler } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { sendUnauthorizedError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as
    | {
        id: string
        email: string
        name: string | null
      }
    | undefined
  const currentSession = event.context.session as { id: string } | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const [companies, activeCompanyId] = await Promise.all([
    companyRepository.findUserCompanies(user.id),
    currentSession ? companyRepository.getActiveCompany(currentSession.id) : Promise.resolve(null),
  ])

  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    activeCompanyId,
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
    })),
  }
})
