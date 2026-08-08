import { defineEventHandler, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'

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
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: JSON.stringify({
        error: 'unauthorized',
        message: 'Authentication required.',
      }),
    })
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
