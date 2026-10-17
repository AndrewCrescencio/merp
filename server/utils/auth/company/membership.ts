import { and, eq, like, or, sql } from 'drizzle-orm'
import { company, companyMember, location } from '../../schema'
import { sendNotFoundError } from '../../shared/errors'
import { withTenant } from '../../db/tenant-context'
import { escapeLikePattern, type CompanyResult } from './repository'

export interface CompanyMemberResult {
  id: string
  companyId: string
  userId: string
  role: string
  createdAt: Date
}

/** Membership operations repository — every query runs under {@link withTenant} (RLS backstop). */
export class MembershipRepository {
  /**
   * Self-adds a user as `member` (test fixtures / future self-join flows).
   * `role` must be `"member"` — owner bootstrap uses
   * {@link CompanyRepository.createCompanyWithOwner}; invite acceptance never uses this method.
   * 409 when the membership already exists.
   */
  async createCompanyMember(
    companyId: string,
    userId: string,
    role = 'member',
  ): Promise<CompanyMemberResult> {
    if (role !== 'member') {
      throw new Error(
        'createCompanyMember: role must be "member"; owner bootstrap uses CompanyRepository.createCompanyWithOwner',
      )
    }
    return await withTenant(companyId, null, userId, async (tx) => {
      await tx.execute(sql`SELECT set_config('app.allow_member_bootstrap', 'true', true)`)
      const [created] = await tx
        .insert(companyMember)
        .values({ companyId, userId, role })
        .returning()
      return created!
    })
  }

  /**
   * Searches non-deleted companies the user belongs to (max 20, LIKE on
   * name/CNPJ with escaped wildcards).
   */
  async searchCompanies(
    query: string,
    userId: string,
  ): Promise<Array<CompanyResult & { role: string }>> {
    const pattern = `%${escapeLikePattern(query)}%`
    return await withTenant(null, null, userId, async (tx) => {
      return await tx
        .select({
          id: company.id,
          name: company.name,
          cnpj: company.cnpj,
          razaoSocial: company.razaoSocial,
          isDeleted: company.isDeleted,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          role: companyMember.role,
        })
        .from(companyMember)
        .innerJoin(company, eq(companyMember.companyId, company.id))
        .where(
          and(
            eq(companyMember.userId, userId),
            eq(company.isDeleted, false),
            or(like(company.name, pattern), like(company.cnpj, pattern)),
          ),
        )
        .limit(20)
    })
  }

  /** Lists non-deleted companies the user belongs to, each with its membership role. */
  async findUserCompanies(userId: string): Promise<Array<CompanyResult & { role: string }>> {
    return await withTenant(null, null, userId, async (tx) => {
      return await tx
        .select({
          id: company.id,
          name: company.name,
          cnpj: company.cnpj,
          razaoSocial: company.razaoSocial,
          isDeleted: company.isDeleted,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          role: companyMember.role,
        })
        .from(companyMember)
        .innerJoin(company, eq(companyMember.companyId, company.id))
        .where(and(eq(companyMember.userId, userId), eq(company.isDeleted, false)))
    })
  }

  /** True when the user is a member of the company. */
  async isCompanyMember(userId: string, companyId: string): Promise<boolean> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [found] = await tx
        .select({ id: companyMember.id })
        .from(companyMember)
        .where(and(eq(companyMember.userId, userId), eq(companyMember.companyId, companyId)))
        .limit(1)
      return !!found
    })
  }

  /** Returns the membership role (`owner`|`member`) or null for non-members. */
  async getCompanyMembershipRole(userId: string, companyId: string): Promise<string | null> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [found] = await tx
        .select({ role: companyMember.role })
        .from(companyMember)
        .where(and(eq(companyMember.userId, userId), eq(companyMember.companyId, companyId)))
        .limit(1)
      return found?.role ?? null
    })
  }

  /**
   * Removes a member. `executedByUserId` drives the RLS authorization
   * (owner removes anyone; a member removes only itself) — never pass the
   * target as executor. 404 when RLS denies or the membership does not exist.
   */
  async removeCompanyMember(
    companyId: string,
    executedByUserId: string,
    targetUserId: string,
  ): Promise<void> {
    return await withTenant(companyId, null, executedByUserId, async (tx) => {
      const deleted = await tx
        .delete(companyMember)
        .where(and(eq(companyMember.companyId, companyId), eq(companyMember.userId, targetUserId)))
        .returning({ id: companyMember.id })

      if (deleted.length === 0) {
        sendNotFoundError('Company member not found')
      }
    })
  }

  /**
   * Atribui (ou limpa com `null`) a loja padrão do membro — a ÚNICA fonte do
   * `location_id` no escopo dele, e portanto o que decide quais lojas o membro
   * enxerga. `null` devolve o membro ao escopo company (donos/admins).
   *
   * A location precisa pertencer à MESMA empresa e estar ativa; a policy de RLS
   * de `location` já filtra por `company_id = get_tenant_id()`, então uma loja
   * de outra empresa simplesmente não é encontrada (404, sem vazar).
   */
  async setMemberDefaultLocation(
    companyId: string,
    executedByUserId: string,
    targetUserId: string,
    defaultLocationId: string | null,
  ): Promise<void> {
    return await withTenant(companyId, null, executedByUserId, async (tx) => {
      const [membership] = await tx
        .select({ id: companyMember.id })
        .from(companyMember)
        .where(and(eq(companyMember.companyId, companyId), eq(companyMember.userId, targetUserId)))
        .limit(1)

      if (!membership) {
        sendNotFoundError('Company member not found')
      }

      if (defaultLocationId !== null) {
        const [found] = await tx
          .select({ id: location.id })
          .from(location)
          .where(and(eq(location.id, defaultLocationId), eq(location.companyId, companyId)))
          .limit(1)

        if (!found) {
          sendNotFoundError('Location not found')
        }
      }

      await tx
        .update(companyMember)
        .set({ defaultLocationId })
        .where(and(eq(companyMember.companyId, companyId), eq(companyMember.userId, targetUserId)))
    })
  }
}

export const membershipRepository = new MembershipRepository()
