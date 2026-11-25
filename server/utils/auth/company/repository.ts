import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { company, companyMember, location } from '../../schema'
import { withTenant } from '../../db/tenant-context'
import { isPgConflict, sendConflictError, sendNotFoundError } from '../../shared/errors'
import { randomUUID } from 'node:crypto'

function rethrowCompanyError(error: unknown): never {
  if (isPgConflict(error)) {
    sendConflictError('A company with this name already exists')
  }
  throw error
}

export function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export interface CreateCompanyInput {
  name: string
}

export interface CompanyResult {
  id: string
  name: string
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface LocationResult {
  id: string
  companyId: string
  name: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CompanyDetailResult extends CompanyResult {
  locations: LocationResult[]
}

/** Company CRUD repository — every query runs under {@link withTenant} (RLS backstop). */
export class CompanyRepository {
  /**
   * Creates a company, its first member (`owner`), and a default location
   * ("Principal") in one transaction (founder bootstrap). 409 when the name
   * is taken.
   * The bootstrap runs with `app.location_id = NULL` so the location INSERT
   * passes the RLS policy (company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL)).
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
              })
              .returning()

            // Create default location "Principal" with app.location_id = NULL (RLS allows this)
            const [defaultLocation] = await ctxTx
              .insert(location)
              .values({
                companyId,
                name: 'Principal',
                isActive: true,
              })
              .returning()

            // Create owner membership with default_location_id pointing to the new location
            await ctxTx.insert(companyMember).values({
              companyId,
              userId: ownerUserId,
              role: 'owner',
              defaultLocationId: defaultLocation!.id,
            })
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

  /**
   * Finds a non-deleted company with its active locations.
   *
   * company: tenant NULL → company_select_policy usa o ramo membership
   * (EXISTS) — outsider NÃO vê. locations: consulta SEPARADA com
   * tenant = companyId na GUC, porque location_select_policy exige
   * company_id = get_tenant_id(); com tenant NULL sairia vazia.
   * A locations só é consultada após o gate de membership da company.
   */
  async findCompanyWithLocations(id: string, userId: string): Promise<CompanyDetailResult | null> {
    return await withTenant(null, null, userId, async (tx) => {
      const [found] = await tx
        .select()
        .from(company)
        .where(and(eq(company.id, id), eq(company.isDeleted, false)))
        .limit(1)

      if (!found) return null

      const locations = await withTenant(
        id,
        null,
        userId,
        (locTx) =>
          locTx
            .select()
            .from(location)
            .where(and(eq(location.companyId, id), eq(location.isActive, true))),
        tx,
      )

      return { ...found, locations }
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
   * Partially updates a company (only defined fields). 404 when RLS denies
   * or the company is deleted.
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
