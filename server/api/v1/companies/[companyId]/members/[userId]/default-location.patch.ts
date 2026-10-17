import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import {
  assertCompanyRole,
  createAuthEvent,
  getClientIp,
  requireTenant,
  sendNotFoundError,
  sendUnauthorizedError,
  validateDefaultLocationInput,
} from '~~/server/utils/shared'

/**
 * Atribui a loja padrão de um membro. É isso que decide quais lojas o membro
 * enxerga: `resolveLocationId` lê esta coluna e injeta o location na GUC, e a
 * RLS filtra por ele. Sem atribuição (`null`) o membro opera em escopo company
 * — estado correto para dono/administrador, errado para staff de loja.
 *
 * Owner-only, como a remoção de membro: quem decide em qual loja um garçom
 * trabalha é a empresa, não o próprio garçom.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // companyId e userId vêm do path (R1/R5); o body só traz a location.
  const { companyId, role } = requireTenant(event)
  const userId = getRouterParam(event, 'userId')
  const { defaultLocationId } = validateDefaultLocationInput(await readBody(event))

  if (!userId) {
    sendNotFoundError('Company member not found')
  }

  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can assign a default location',
  )

  await membershipRepository.setMemberDefaultLocation(companyId, user.id, userId, defaultLocationId)

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'member_default_location_updated',
    ipAddress: getClientIp(event) || null,
    metadata: { companyId, targetUserId: userId, defaultLocationId },
  })

  return { message: 'Default location updated successfully' }
})
