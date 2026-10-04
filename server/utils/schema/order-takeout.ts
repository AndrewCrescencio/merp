import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { order } from './order'

export const orderTakeout = pgTable(
  'order_takeout',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => order.id, { onDelete: 'cascade' }),
    pickupAt: timestamp('pickup_at', { withTimezone: true }),
    pickupName: text('pickup_name'),
    pickupPhone: text('pickup_phone'),
  },
  (table) => [index('order_takeout_pickup_at_idx').on(table.pickupAt)],
)

export type OrderTakeoutInsert = typeof orderTakeout.$inferInsert
export type OrderTakeoutSelect = typeof orderTakeout.$inferSelect
