import { and, eq, sql } from 'drizzle-orm'
import { company, companyMember, location } from '../../schema'
import { withTenant, type TenantTransaction } from '../../db/tenant-context'
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
    transaction?: TenantTransaction,
  ): Promise<CompanyResult> {
    try {
      const companyId = randomUUID()
      const context = { companyId, locationId: null, userId: ownerUserId }
      const create = async (tx: TenantTransaction): Promise<CompanyResult> => {
        const [row] = await tx
          .insert(company)
          .values({ id: companyId, name: data.name })
          .returning()

        // The NULL location scope explicitly permits creating Principal.
        const [defaultLocation] = await tx
          .insert(location)
          .values({ companyId, name: 'Principal', isActive: true })
          .returning()

        const [marker] = await tx.execute(sql`
          SELECT current_setting('app.allow_founder_bootstrap', true) AS value
        `)
        await tx.execute(sql`SELECT set_config('app.allow_founder_bootstrap', 'true', true)`)
        await tx.insert(companyMember).values({
          companyId,
          userId: ownerUserId,
          role: 'owner',
          defaultLocationId: defaultLocation!.id,
        })
        await tx.execute(
          sql`SELECT set_config('app.allow_founder_bootstrap', ${marker?.value ?? ''}, true)`,
        )
        return row!
      }

      // Company creation discovers its own company id and is an explicit
      // pre-company -> company scope transition inside a caller-owned tx.
      return transaction
        ? await withTenant(context, create, { transaction, scope: 'transition' })
        : await withTenant(context, create)
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
  async findCompanyWithLocations(
    id: string,
    userId: string,
    transaction?: TenantTransaction,
  ): Promise<CompanyDetailResult | null> {
    const context = { companyId: null, locationId: null, userId }
    const find = async (tx: TenantTransaction): Promise<CompanyDetailResult | null> => {
      const [found] = await tx
        .select()
        .from(company)
        .where(and(eq(company.id, id), eq(company.isDeleted, false)))
        .limit(1)

      if (!found) return null

      const locations = await withTenant(
        { companyId: id, locationId: null, userId },
        (locTx) =>
          locTx
            .select()
            .from(location)
            .where(and(eq(location.companyId, id), eq(location.isActive, true))),
        { transaction: tx, scope: 'temporary' },
      )

      return { ...found, locations }
    }
    return transaction
      ? await withTenant(context, find, { transaction, scope: 'temporary' })
      : await withTenant(context, find)
  }

  /**
   * Soft-deletes a company: flags `is_deleted`, purges memberships and
   * detaches sessions pointing at it. 404 when RLS denies or already deleted.
   */
  async softDeleteCompany(
    companyId: string,
    userId: string,
    transaction?: TenantTransaction,
  ): Promise<CompanyResult> {
    const operation = async (tx: TenantTransaction): Promise<CompanyResult> => {
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
    }
    const context = { companyId, locationId: null, userId }
    return transaction
      ? await withTenant(context, operation, { transaction })
      : await withTenant(context, operation)
  }

  /**
   * Partially updates a company (only defined fields). 404 when RLS denies
   * or the company is deleted.
   */
  async updateCompany(
    companyId: string,
    userId: string,
    input: Partial<CreateCompanyInput>,
    transaction?: TenantTransaction,
  ): Promise<CompanyResult> {
    try {
      const operation = async (tx: TenantTransaction): Promise<CompanyResult> => {
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
      }
      const context = { companyId, locationId: null, userId }
      return transaction
        ? await withTenant(context, operation, { transaction })
        : await withTenant(context, operation)
    } catch (error) {
      rethrowCompanyError(error)
    }
  }
}

export const companyRepository = new CompanyRepository()
