import { and, eq, like, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { company, companyMember, session } from '../../schema'
import { sendForbiddenError, sendNotFoundError, handleDatabaseError } from '../../shared/errors'
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
   * target as executor. Detaches the removed user's sessions from the
   * company. 404 when RLS denies or the membership does not exist.
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

      await tx
        .update(session)
        .set({ activeCompanyId: null, updatedAt: new Date() })
        .where(and(eq(session.userId, targetUserId), eq(session.activeCompanyId, companyId)))
    })
  }

  /**
   * Points a session at a company (`null` clears it). Membership is
   * re-validated in the same transaction (TOCTOU-safe). 403 for non-members.
   */
  async setActiveCompany(
    sessionId: string,
    companyId: string | null,
    userId: string,
  ): Promise<void> {
    await withTenant(companyId, null, userId, async (tx) => {
      if (companyId !== null) {
        const [membership] = await tx
          .select({ id: companyMember.id })
          .from(companyMember)
          .where(and(eq(companyMember.companyId, companyId), eq(companyMember.userId, userId)))
          .limit(1)

        if (!membership) {
          sendForbiddenError('User is not a member of the specified company')
        }
      }

      await tx
        .update(session)
        .set({ activeCompanyId: companyId, updatedAt: new Date() })
        .where(eq(session.id, sessionId))
    })
  }

  /** Returns the session's active company id, or null. */
  async getActiveCompany(sessionId: string): Promise<string | null> {
    try {
      const [found] = await db
        .select({ activeCompanyId: session.activeCompanyId })
        .from(session)
        .where(eq(session.id, sessionId))
        .limit(1)

      return found?.activeCompanyId || null
    } catch (error: unknown) {
      return handleDatabaseError(error)
    }
  }
}

export const membershipRepository = new MembershipRepository()
