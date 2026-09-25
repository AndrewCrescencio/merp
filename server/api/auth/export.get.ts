import { defineEventHandler } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
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

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const [fullUser, companies, sessions, authEvents] = await Promise.all([
    identityRepository.findById(user.id),
    companyRepository.findUserCompanies(user.id),
    identityRepository.getUserSessions(user.id),
    identityRepository.listUserAuthEvents(user.id),
  ])

  return {
    profile: {
      id: fullUser?.id || user.id,
      email: user.email,
      name: user.name,
      createdAt: fullUser?.createdAt,
    },
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      cnpj: c.cnpj,
      razaoSocial: c.razaoSocial,
      role: c.role,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    })),
    authEvents: authEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      ipAddress: e.ipAddress,
      createdAt: e.createdAt,
    })),
  }
})
