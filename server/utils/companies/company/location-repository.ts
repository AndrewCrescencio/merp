import { and, eq } from 'drizzle-orm'
import { companyMember, location } from '../../schema'
import { withTenant, type TenantScope, type TenantTransaction } from '../../db/tenant-context'
import { sendNotFoundError } from '../../shared/errors'
import type { LocationResult } from './repository'

function inScope<T>(
  context: TenantScope,
  operation: (tx: TenantTransaction) => Promise<T>,
  transaction?: TenantTransaction,
): Promise<T> {
  return transaction
    ? withTenant(context, operation, { transaction })
    : withTenant(context, operation)
}

export interface CreateLocationInput {
  name: string
}

export interface UpdateLocationInput {
  name?: string
  isActive?: boolean
}

/** Location repository — every query runs under {@link withTenant} (RLS backstop). */
export class LocationRepository {
  /**
   * Lists active locations for a company.
   * Any company member can read.
   */
  async listLocations(
    companyId: string,
    userId: string,
    transaction?: TenantTransaction,
  ): Promise<LocationResult[]> {
    return await inScope(
      { companyId, locationId: null, userId },
      async (tx) => {
        return await tx
          .select()
          .from(location)
          .where(and(eq(location.companyId, companyId), eq(location.isActive, true)))
      },
      transaction,
    )
  }

  /**
   * Creates a new location for a company.
   * Owner-only (checked by caller via assertRole); RLS backstop is
   * tenant-level, same as membership repositories. Runs with
   * app.location_id = NULL so the INSERT passes the location policy
   * (id = get_location_id() OR get_location_id() IS NULL).
   */
  async createLocation(
    companyId: string,
    userId: string,
    input: CreateLocationInput,
    transaction?: TenantTransaction,
  ): Promise<LocationResult> {
    return await inScope(
      { companyId, locationId: null, userId },
      async (tx) => {
        const [row] = await tx
          .insert(location)
          .values({ companyId, name: input.name, isActive: true })
          .returning()
        return row!
      },
      transaction,
    )
  }

  /**
   * Updates a location (name and/or isActive).
   * Owner-only (checked by caller via assertRole).
   */
  async updateLocation(
    companyId: string,
    userId: string,
    locationId: string,
    input: UpdateLocationInput,
    transaction?: TenantTransaction,
  ): Promise<LocationResult> {
    return await inScope(
      { companyId, locationId: null, userId },
      async (tx) => {
        const updates: Partial<typeof location.$inferInsert> = { updatedAt: new Date() }
        if (input.name !== undefined) updates.name = input.name
        if (input.isActive !== undefined) updates.isActive = input.isActive

        const [updated] = await tx
          .update(location)
          .set(updates)
          .where(and(eq(location.id, locationId), eq(location.companyId, companyId)))
          .returning()

        if (!updated) {
          sendNotFoundError('Location not found')
        }
        if (input.isActive === false) {
          await tx
            .update(companyMember)
            .set({ defaultLocationId: null })
            .where(
              and(
                eq(companyMember.companyId, companyId),
                eq(companyMember.defaultLocationId, locationId),
              ),
            )
        }
        return updated!
      },
      transaction,
    )
  }

  /**
   * Soft-deletes a location (sets isActive = false).
   * Owner-only (checked by caller via assertRole).
   */
  async softDeleteLocation(
    companyId: string,
    userId: string,
    locationId: string,
    transaction?: TenantTransaction,
  ): Promise<LocationResult> {
    return await inScope(
      { companyId, locationId: null, userId },
      async (tx) => {
        const [updated] = await tx
          .update(location)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(location.id, locationId), eq(location.companyId, companyId)))
          .returning()

        if (!updated) {
          sendNotFoundError('Location not found')
        }
        await tx
          .update(companyMember)
          .set({ defaultLocationId: null })
          .where(
            and(
              eq(companyMember.companyId, companyId),
              eq(companyMember.defaultLocationId, locationId),
            ),
          )
        return updated!
      },
      transaction,
    )
  }
}

export const locationRepository = new LocationRepository()
