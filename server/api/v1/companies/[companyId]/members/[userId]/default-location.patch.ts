import { getRouterParam } from 'h3'
import { membershipRepository } from '~~/server/utils/companies/company/membership'
import {
  createAuthEvent,
  getClientIp,
  defineAuthHandler,
  ROLES,
  sendNotFoundError,
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
export default defineAuthHandler(
  {
    tenant: true,
    role: ROLES.owner,
    forbiddenMessage: 'Only company owners can assign a default location',
    body: validateDefaultLocationInput,
  },
  async ({ event, tenant: { companyId }, user, body: { defaultLocationId } }) => {
    const userId = getRouterParam(event, 'userId')
    if (!userId) sendNotFoundError('Company member not found')

    await membershipRepository.setMemberDefaultLocation(
      companyId,
      user.id,
      userId,
      defaultLocationId,
    )

    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'member_default_location_updated',
      ipAddress: getClientIp(event) || null,
      metadata: { companyId, targetUserId: userId, defaultLocationId },
    })
    return { message: 'Default location updated successfully' }
  },
)
