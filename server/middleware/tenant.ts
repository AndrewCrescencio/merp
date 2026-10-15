import { defineEventHandler, getRequestURL, createError } from 'h3'
import { membershipRepository } from '~~/server/utils/auth/company/membership'

/**
 * Tenant middleware (fail-closed). Roda DEPOIS do auth (ordem alfabética:
 * `auth` < `tenant`), então `event.context.user` já está garantido para rotas
 * não-públicas.
 *
 * Para toda rota `/api/v1/companies/{companyId}/...`, extrai o `companyId` do
 * PATH por regex (middleware global não tem `getRouterParam`), valida
 * membership naquela empresa e grava `event.context.tenant = { companyId, role }`.
 *
 * R8: membro sem papel → 403; não-membro OU empresa inexistente → 404 (não
 * vaza existência entre tenants). A "empresa ativa" deixa de existir no
 * servidor — o tenant vive só no path.
 */
const TENANT_PATH = /^\/api\/v1\/companies\/([^/]+)(\/|$)/

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  const match = TENANT_PATH.exec(path)

  if (!match) {
    return
  }

  const companyId = match[1]
  if (!companyId) {
    return
  }

  // O auth middleware já garantiu sessão para rotas não-públicas; defensivo
  // caso esta rota seja exposta como pública por engano.
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    throw createError({ statusCode: 401, message: 'Authentication required.' })
  }

  const role = await membershipRepository.getCompanyMembershipRole(user.id, companyId)

  if (!role) {
    // Não-membro ou empresa inexistente: mesmo 404 para não enumerar tenants.
    throw createError({ statusCode: 404, message: 'not_found' })
  }

  event.context.tenant = { companyId, role }
})
