import { and, eq } from 'drizzle-orm'
import { withTenant } from '../db/tenant-context'
import { companyMember } from '../schema'
import { sendValidationError } from './errors'

/**
 * Fonte do `location_id` no escopo do membro — ADR-002 §Consequências
 * (`company_member.default_location_id`).
 *
 * Fecha o H07: antes os handlers de restaurant/print/order forjavam a fonte com
 * `''`, o que funcionava no GUC (vira NULL → escopo company) mas quebrava nos
 * `eq(col, locationId)` do repositório, que enxergavam um valor concreto.
 *
 * `null` é resultado válido e significa "sem location no escopo": o chamador
 * opera em escopo company, que a RLS já permite pelo escape
 * `OR get_location_id() IS NULL` de ADR-002 — o tenant continua exigido, não é
 * fail-open. Para writes use {@link requireLocationId}, porque `location_id` é
 * NOT NULL + FK e não há como gravar sem um location real.
 */
export async function resolveLocationId(companyId: string, userId: string): Promise<string | null> {
  // company_member tem RLS company-only, então a leitura precisa do tenant na GUC.
  return withTenant(companyId, null, userId, async (tx) => {
    const [row] = await tx
      .select({ defaultLocationId: companyMember.defaultLocationId })
      .from(companyMember)
      .where(and(eq(companyMember.companyId, companyId), eq(companyMember.userId, userId)))
      .limit(1)

    return row?.defaultLocationId ?? null
  })
}

/**
 * Como {@link resolveLocationId}, mas para caminhos de escrita: `location_id` é
 * NOT NULL com FK para `location`, então NULL não tem como ser gravado — em vez
 * de estourar 500 com violação de constraint, devolve 400 acionável.
 */
export async function requireLocationId(companyId: string, userId: string): Promise<string> {
  const locationId = await resolveLocationId(companyId, userId)
  if (!locationId) {
    sendValidationError('No default location configured for this company')
  }
  return locationId
}
