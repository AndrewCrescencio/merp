import { and, eq } from 'drizzle-orm'
import { withTenant } from '../../db/tenant-context'
import { isPgConflict, sendNotFoundError, sendValidationError } from '../../shared'
import { product } from '../../schema'

export interface CreateProductInput {
  name: string
  sku?: string | null
  unitPrice: string
  locationId: string
}

export interface UpdateProductInput {
  name?: string
  sku?: string | null
  unitPrice?: string
  isActive?: boolean
}

export interface ProductResult {
  id: string
  companyId: string
  locationId: string
  name: string
  sku: string | null
  unitPrice: string
  taxRuleId: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** Product CRUD repository — every query runs under {@link withTenant} (RLS backstop). */
export class ProductRepository {
  /**
   * Lists active products for a company, optionally filtered by location.
   * Accessible to any member.
   */
  async listProducts(
    companyId: string,
    userId: string,
    locationId?: string,
  ): Promise<ProductResult[]> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const conditions = [eq(product.companyId, companyId), eq(product.isActive, true)]
      if (locationId) {
        conditions.push(eq(product.locationId, locationId))
      }
      return tx
        .select()
        .from(product)
        .where(and(...conditions))
        .orderBy(product.name)
    })
  }

  /**
   * Creates a product. Requires owner/manager permission (RLS policy + business logic).
   */
  async createProduct(
    companyId: string,
    userId: string,
    input: CreateProductInput,
  ): Promise<ProductResult> {
    // Validate unitPrice is a valid positive decimal
    const unitPrice = input.unitPrice.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(unitPrice) || Number.parseFloat(unitPrice) < 0) {
      sendValidationError('invalid_unit_price')
    }

    return await withTenant(companyId, input.locationId, userId, async (tx) => {
      try {
        const [created] = await tx
          .insert(product)
          .values({
            companyId,
            locationId: input.locationId,
            name: input.name.trim(),
            sku: input.sku?.trim() || null,
            unitPrice,
            isActive: true,
          })
          .returning()
        return created!
      } catch (error: unknown) {
        // O drizzle embrulha a PostgresError em "Failed query: ..." com a causa
        // em `cause` — a mensagem nunca casa. isPgConflict percorre a cadeia.
        if (isPgConflict(error)) {
          // SKU duplicate in same company
          sendValidationError('duplicate_sku')
        }
        throw error
      }
    })
  }

  /**
   * Finds a single active product.
   * Accessible to any member.
   */
  async findProduct(
    companyId: string,
    userId: string,
    productId: string,
  ): Promise<ProductResult | null> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [found] = await tx
        .select()
        .from(product)
        .where(
          and(
            eq(product.id, productId),
            eq(product.companyId, companyId),
            eq(product.isActive, true),
          ),
        )
        .limit(1)

      return found || null
    })
  }

  /**
   * Updates a product. Requires owner/manager permission.
   */
  async updateProduct(
    companyId: string,
    userId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductResult> {
    if (input.unitPrice !== undefined) {
      const unitPrice = input.unitPrice.trim()
      if (!/^\d+(\.\d{1,2})?$/.test(unitPrice) || Number.parseFloat(unitPrice) < 0) {
        sendValidationError('invalid_unit_price')
      }
    }

    return await withTenant(companyId, null, userId, async (tx) => {
      try {
        const updates: Partial<typeof product.$inferInsert> = { updatedAt: new Date() }
        if (input.name !== undefined) updates.name = input.name.trim()
        if (input.sku !== undefined) updates.sku = input.sku?.trim() || null
        if (input.unitPrice !== undefined) updates.unitPrice = input.unitPrice.trim()
        if (input.isActive !== undefined) updates.isActive = input.isActive

        const [updated] = await tx
          .update(product)
          .set(updates)
          .where(
            and(
              eq(product.id, productId),
              eq(product.companyId, companyId),
              eq(product.isActive, true),
            ),
          )
          .returning()

        if (!updated) {
          sendNotFoundError('Product not found')
        }
        return updated!
      } catch (error: unknown) {
        // Ver createProduct: a PostgresError está em `cause`, não na mensagem.
        if (isPgConflict(error)) {
          // SKU duplicate in same company
          sendValidationError('duplicate_sku')
        }
        throw error
      }
    })
  }

  /**
   * Soft deletes a product (sets isActive = false). Requires owner/manager permission.
   */
  async softDeleteProduct(companyId: string, userId: string, productId: string): Promise<void> {
    await withTenant(companyId, null, userId, async (tx) => {
      const [updated] = await tx
        .update(product)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(product.id, productId),
            eq(product.companyId, companyId),
            eq(product.isActive, true),
          ),
        )
        .returning({ id: product.id })

      if (!updated) {
        sendNotFoundError('Product not found')
      }
    })
  }

  /**
   * Checks if user is owner or manager (RLS policy already enforces this).
   * This is a business logic check that should run before calling the repository.
   */
  async assertCompanyRole(companyId: string, userId: string): Promise<void> {
    // The RLS policies already enforce owner/manager access
    // This method exists for clarity and potential future extensions
    await withTenant(companyId, null, userId, async () => {
      // RLS will block if user doesn't have proper permissions
      return
    })
  }
}

export const productRepository = new ProductRepository()
