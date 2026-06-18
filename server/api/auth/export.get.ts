import { defineEventHandler, createError } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'

export default defineEventHandler(async (event) => {
  const user = event.context.user as
    | {
        id: string
        email: string
        name: string | null
      }
    | undefined

  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const [fullUser, companies, sessions] = await Promise.all([
    authRepository.findById(user.id),
    authRepository.findUserCompanies(user.id),
    authRepository.getUserSessions(user.id),
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
  }
})
