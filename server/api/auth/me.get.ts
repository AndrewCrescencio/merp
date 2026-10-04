import { defineEventHandler } from 'h3'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
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
    membershipRepository.findUserCompanies(user.id),
    currentSession ? membershipRepository.getActiveCompany(currentSession.id) : Promise.resolve(null),
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
