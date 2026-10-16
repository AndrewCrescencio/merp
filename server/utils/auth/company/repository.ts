import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { company, companyMember } from '../../schema'
import { withTenant } from '../../db/tenant-context'
import { isPgConflict, sendConflictError, sendNotFoundError } from '../../shared/errors'
import { randomUUID } from 'node:crypto'

/** CNPJ tem índice unique — conflito vira 409 em vez de estourar como 500. */
function rethrowCompanyError(error: unknown): never {
  if (isPgConflict(error)) {
    sendConflictError('A company with this CNPJ already exists')
  }
  throw error
}

export function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export interface CreateCompanyInput {
  name: string
  cnpj?: string
  razaoSocial?: string
}

export interface CompanyResult {
  id: string
  name: string
  cnpj: string | null
  razaoSocial: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

/** Company CRUD repository — every query runs under {@link withTenant} (RLS backstop). */
export class CompanyRepository {
  /**
   * Creates a company row without members (low-level; prefer
   * {@link createCompanyWithOwner}). 409 when the CNPJ is taken.
   */
  async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
    const companyId = randomUUID()
    return await withTenant(companyId, null, null, async (tx) => {
      const [created] = await tx
        .insert(company)
        .values({
          id: companyId,
          name: input.name,
          cnpj: input.cnpj || null,
          razaoSocial: input.razaoSocial || null,
        })
        .returning()
      return created!
    })
  }

  /**
   * Creates a company and its first member (`owner`) in one transaction
   * (founder bootstrap). 409 when the CNPJ is taken.
   */
  async createCompanyWithOwner(
    data: CreateCompanyInput,
    ownerUserId: string,
  ): Promise<CompanyResult> {
    try {
      return await db.transaction(async (tx) => {
        const companyId = randomUUID()
        const created = await withTenant(
          companyId,
          null,
          ownerUserId,
          async (ctxTx) => {
            await ctxTx.execute(sql`SELECT set_config('app.allow_founder_bootstrap', 'true', true)`)
            const [row] = await ctxTx
              .insert(company)
              .values({
                id: companyId,
                name: data.name,
                cnpj: data.cnpj,
                razaoSocial: data.razaoSocial,
              })
              .returning()
            await ctxTx
              .insert(companyMember)
              .values({ companyId, userId: ownerUserId, role: 'owner' })
            return row!
          },
          tx,
        )

        return created
      })
    } catch (error) {
      rethrowCompanyError(error)
    }
  }

  /** Finds a non-deleted company visible to the user, or null (RLS outsiders get null). */
  async findCompanyById(id: string, userId: string): Promise<CompanyResult | null> {
    return await withTenant(null, null, userId, async (tx) => {
      const [found] = await tx
        .select()
        .from(company)
        .where(and(eq(company.id, id), eq(company.isDeleted, false)))
        .limit(1)

      return found || null
    })
  }

  /**
   * Soft-deletes a company: flags `is_deleted`, purges memberships and
   * detaches sessions pointing at it. 404 when RLS denies or already deleted.
   */
  async softDeleteCompany(companyId: string, userId: string): Promise<CompanyResult> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [updated] = await tx
        .update(company)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(company.id, companyId))
        .returning()
      if (!updated) {
        sendNotFoundError('Company not found')
      }
      await tx.delete(companyMember).where(eq(companyMember.companyId, companyId))

      return updated!
    })
  }

  /**
   * Partially updates a company (only defined fields; empty cnpj/razaoSocial
   * clears the column). 404 when RLS denies or the company is deleted.
   */
  async updateCompany(
    companyId: string,
    userId: string,
    input: Partial<CreateCompanyInput>,
  ): Promise<CompanyResult> {
    try {
      return await withTenant(companyId, null, userId, async (tx) => {
        const updates: Partial<typeof company.$inferInsert> = { updatedAt: new Date() }
        if (input.name !== undefined) updates.name = input.name
        if (input.cnpj !== undefined) updates.cnpj = input.cnpj || null
        if (input.razaoSocial !== undefined) updates.razaoSocial = input.razaoSocial || null

        const [updated] = await tx
          .update(company)
          .set(updates)
          .where(and(eq(company.id, companyId), eq(company.isDeleted, false)))
          .returning()

        if (!updated) {
          sendNotFoundError('Company not found')
        }
        return updated!
      })
    } catch (error) {
      rethrowCompanyError(error)
    }
  }
}

export const companyRepository = new CompanyRepository()
