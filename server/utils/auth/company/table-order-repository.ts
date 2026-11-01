import { and, eq, sql } from 'drizzle-orm'
import { sendValidationError } from '../../shared'
import { withTenant } from '../../db/tenant-context'
import { order, orderItem, restaurantTable, kitchenTicket, kitchenStation } from '../../schema'

export interface OpenTableInput {
  tableId: string
  coverCount: number
}

export interface CloseTableInput {
  cancelEmpty?: boolean
}

export interface OrderResult {
  id: string
  companyId: string
  locationId: string
  orderType: string
  status: string
  totalAmount: string
  customerId: string | null
  partyId: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface OrderItemResult {
  id: string
  companyId: string
  locationId: string
  orderId: string
  productId: string | null
  productName: string
  unitPrice: string
  quantity: string
  taxSnapshot: string
  bomSnapshot: string
  lineTotal: string
  createdAt: Date
  updatedAt: Date
}

/** Order management for restaurant tables - every query runs under {@link withTenant} (RLS backstop). */
export class TableOrderRepository {
  /**
   * Opens a table: creates a dine_in order and sets current_order_id on the table.
   * Uses FOR UPDATE to prevent race conditions between concurrent opens.
   */
  async openTable(
    companyId: string,
    userId: string,
    locationId: string,
    input: OpenTableInput,
  ): Promise<OrderResult> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      // First, lock the table row to prevent concurrent opens
      const [table] = await tx
        .select()
        .from(restaurantTable)
        .where(
          and(
            eq(restaurantTable.id, input.tableId),
            eq(restaurantTable.companyId, companyId),
            eq(restaurantTable.locationId, locationId),
          ),
        )
        .for('update')
        .limit(1)

      if (!table) {
        sendValidationError('table_not_found')
      }

      if (table.currentOrderId) {
        sendValidationError('table_already_open')
      }

      // Create the order
      const [createdOrder] = await tx
        .insert(order)
        .values({
          companyId,
          locationId,
          orderType: 'dine_in',
          status: 'open',
          totalAmount: '0',
          createdBy: userId,
        })
        .returning()

      // Update the table with current_order_id
      const [_updatedTable] = await tx
        .update(restaurantTable)
        .set({
          currentOrderId: createdOrder.id,
          status: 'occupied',
          updatedAt: new Date(),
        })
        .where(eq(restaurantTable.id, input.tableId))
        .returning()

      return createdOrder
    })
  }

  /**
   * Closes a table: completes or cancels the order and clears current_order_id.
   * Uses FOR UPDATE to prevent race conditions.
   */
  async closeTable(
    companyId: string,
    userId: string,
    locationId: string,
    tableId: string,
    input: CloseTableInput,
  ): Promise<void> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      // Lock the table to prevent concurrent operations
      const [table] = await tx
        .select()
        .from(restaurantTable)
        .where(
          and(
            eq(restaurantTable.id, tableId),
            eq(restaurantTable.companyId, companyId),
            eq(restaurantTable.locationId, locationId),
          ),
        )
        .for('update')
        .limit(1)

      if (!table) {
        sendValidationError('table_not_found')
      }

      if (!table.currentOrderId) {
        sendValidationError('table_not_open')
      }

      // Lock the order
      const [orderToClose] = await tx
        .select()
        .from(order)
        .where(
          and(
            eq(order.id, table.currentOrderId),
            eq(order.companyId, companyId),
            eq(order.locationId, locationId),
            eq(order.status, 'open'),
          ),
        )
        .for('update')
        .limit(1)

      if (!orderToClose) {
        sendValidationError('order_not_open')
      }

      // Complete or cancel based on whether order has items
      const hasItems = await tx
        .select({ count: sql<number>`count(*)` })
        .from(orderItem)
        .where(eq(orderItem.orderId, table.currentOrderId))
        .then((rows) => Number(rows[0]?.count || 0) > 0)

      const newStatus = hasItems ? 'completed' : input.cancelEmpty ? 'cancelled' : 'completed'

      await tx
        .update(order)
        .set({
          status: newStatus,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(order.id, table.currentOrderId))

      // Clear current_order_id and restore table status
      await tx
        .update(restaurantTable)
        .set({
          currentOrderId: null,
          status: 'available',
          updatedAt: new Date(),
        })
        .where(eq(restaurantTable.id, tableId))
    })
  }

  /**
   * Adds an item to an open order.
   * Validates that product (if provided) belongs to the same location.
   * Creates kitchen ticket if product has kitchenStationId.
   * Returns the created order item.
   */
  async addItemToOrder(
    companyId: string,
    userId: string,
    locationId: string,
    orderId: string,
    input: {
      productId?: string
      productName: string
      unitPrice: string
      quantity: string
      taxSnapshot: string
      bomSnapshot: string
    },
  ): Promise<OrderItemResult> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      // Lock the order to prevent concurrent modifications
      const [currentOrder] = await tx
        .select()
        .from(order)
        .where(
          and(
            eq(order.id, orderId),
            eq(order.companyId, companyId),
            eq(order.locationId, locationId),
            eq(order.status, 'open'),
          ),
        )
        .for('update')
        .limit(1)

      if (!currentOrder) {
        sendValidationError('order_not_open')
      }

      let productId: string | null = input.productId || null
      let kitchenStationId: string | null = null

      // If productId provided, validate it belongs to same location
      if (input.productId) {
        const [product] = await tx
          .select({ kitchenStationId: import('~~/server/utils/schema').product.kitchenStationId })
          .from(import('~~/server/utils/schema').product)
          .where(
            and(
              eq(import('~~/server/utils/schema').product.id, input.productId),
              eq(import('~~/server/utils/schema').product.companyId, companyId),
              eq(import('~~/server/utils/schema').product.locationId, locationId),
              eq(import('~~/server/utils/schema').product.isActive, true),
            ),
          )
          .limit(1)

        if (!product) {
          sendValidationError('product_not_found_or_not_in_location')
        }

        productId = input.productId
        kitchenStationId = product.kitchenStationId
      }

      // Insert the order item
      const [createdItem] = await tx
        .insert(orderItem)
        .values({
          companyId,
          locationId,
          orderId,
          productId,
          productName: input.productName,
          unitPrice: input.unitPrice,
          quantity: input.quantity,
          taxSnapshot: input.taxSnapshot,
          bomSnapshot: input.bomSnapshot,
        })
        .returning()

      // If product has kitchenStationId, create a kitchen ticket
      if (kitchenStationId) {
        const [station] = await tx
          .select()
          .from(kitchenStation)
          .where(
            and(
              eq(kitchenStation.id, kitchenStationId),
              eq(kitchenStation.companyId, companyId),
              eq(kitchenStation.locationId, locationId),
              eq(kitchenStation.isActive, true),
            ),
          )
          .limit(1)

        if (!station) {
          sendValidationError('kitchen_station_not_found_or_not_in_location')
        }

        // Create kitchen ticket
        await tx.insert(kitchenTicket).values({
          companyId,
          locationId,
          orderId,
          orderItemId: createdItem.id,
          stationId: kitchenStationId,
          status: 'pending',
          priority: 0,
        })
      }

      // Recalculate total
      await this.recalculateOrderTotal(tx, orderId)

      return createdItem
    })
  }

  /**
   * Removes an item from an open order.
   */
  async removeItemFromOrder(
    companyId: string,
    userId: string,
    locationId: string,
    orderId: string,
    itemId: string,
  ): Promise<void> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      // Lock the order
      const [currentOrder] = await tx
        .select()
        .from(order)
        .where(
          and(
            eq(order.id, orderId),
            eq(order.companyId, companyId),
            eq(order.locationId, locationId),
            eq(order.status, 'open'),
          ),
        )
        .for('update')
        .limit(1)

      if (!currentOrder) {
        sendValidationError('order_not_open')
      }

      // Delete the item
      const deleted = await tx
        .delete(orderItem)
        .where(and(eq(orderItem.id, itemId), eq(orderItem.orderId, orderId)))
        .returning({ id: orderItem.id })

      if (deleted.length === 0) {
        sendValidationError('order_item_not_found')
      }

      // Recalculate total
      await this.recalculateOrderTotal(tx, orderId)
    })
  }

  /**
   * Recalculates the total amount for an order based on its items.
   */
  private async recalculateOrderTotal(tx: unknown, orderId: string): Promise<void> {
    const [result] = await tx
      .select({
        total: sql<number>`coalesce(sum(line_total), 0)`,
      })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId))

    await tx
      .update(order)
      .set({
        totalAmount: String(result?.total || 0),
        updatedAt: new Date(),
      })
      .where(eq(order.id, orderId))
  }

  /**
   * Gets the current open order for a table.
   */
  async getCurrentOrderForTable(
    companyId: string,
    userId: string,
    locationId: string,
    tableId: string,
  ): Promise<OrderResult | null> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      const [table] = await tx
        .select()
        .from(restaurantTable)
        .where(
          and(
            eq(restaurantTable.id, tableId),
            eq(restaurantTable.companyId, companyId),
            eq(restaurantTable.locationId, locationId),
          ),
        )
        .limit(1)

      if (!table || !table.currentOrderId) {
        return null
      }

      const [order] = await tx
        .select()
        .from(order)
        .where(eq(order.id, table.currentOrderId))
        .limit(1)

      return order || null
    })
  }
}

export const tableOrderRepository = new TableOrderRepository()
