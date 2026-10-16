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

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const companies = await membershipRepository.findUserCompanies(user.id)

  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
    })),
  }
})
