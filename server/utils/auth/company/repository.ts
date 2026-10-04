import { randomUUID } from 'node:crypto'
import { and, eq, like, or } from 'drizzle-orm'
import { db } from '../../db'
import { company } from '../../schema'
import { createError, H3Error } from 'h3'
import {
  handleDatabaseError,
  sendConflictError,
  sendNotFoundError,
  isPgConflict,
} from '../../shared/errors'
import { withTenant } from '../tenant-context'

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
    try {
      const companyId = randomUUID()
      return await withTenant(companyId, null, async (tx) => {
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
    } catch (error: any) {
      if (isPgConflict(error)) {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'CNPJ already registered',
          }),
        })
      }
      return handleDatabaseError(error)
    }
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
    } catch (error: any) {
      if (isPgConflict(error)) {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'CNPJ already registered',
          }),
        })
      }
      return handleDatabaseError(error)
    }
  }

  /** Finds a non-deleted company visible to the user, or null (RLS outsiders get null). */
  async findCompanyById(id: string, userId: string): Promise<CompanyResult | null> {
    try {
      return await withTenant(null, userId, async (tx) => {
        const [found] = await tx
          .select()
          .from(company)
          .where(and(eq(company.id, id), eq(company.isDeleted, false)))
          .limit(1)

        return found || null
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /**
   * Soft-deletes a company: flags `is_deleted`, purges memberships and
   * detaches sessions pointing at it. 404 when RLS denies or already deleted.
   */
  async softDeleteCompany(companyId: string, userId: string): Promise<CompanyResult> {
    try {
      return await withTenant(companyId, userId, async (tx) => {
        const [updated] = await tx
          .update(company)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(eq(company.id, companyId))
          .returning()
        if (!updated) {
          sendNotFoundError('Company not found')
        }
        await tx.delete(companyMember).where(eq(companyMember.companyId, companyId))

        await tx
          .update(session)
          .set({ activeCompanyId: null, updatedAt: new Date() })
          .where(eq(session.activeCompanyId, companyId))

        return updated!
      })
    } catch (error) {
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  /**
   * Partially updates a company (only defined fields; empty cnpj/razaoSocial
   * clears the column). 404 when RLS denies or the company is deleted;
   * 409 on duplicate CNPJ.
   */
  async updateCompany(
    companyId: string,
    userId: string,
    input: Partial<CreateCompanyInput>,
  ): Promise<CompanyResult> {
    try {
      return await withTenant(companyId, userId, async (tx) => {
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
    } catch (error: any) {
      if (isPgConflict(error)) {
        sendConflictError('CNPJ already registered')
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }
}

export const companyRepository = new CompanyRepository()