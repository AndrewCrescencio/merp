import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import { order } from './order'
import { restaurantTable } from './restaurant-table'

export const orderDineIn = pgTable(
  'order_dine_in',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => order.id, { onDelete: 'cascade' }),
    tableId: text('table_id')
      .notNull()
      .references(() => restaurantTable.id, { onDelete: 'cascade' }),
    coverCount: integer('cover_count').notNull().default(1),
    waiterId: text('waiter_id'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('order_dine_in_table_id_idx').on(table.tableId),
    index('order_dine_in_waiter_id_idx').on(table.waiterId),
  ],
)

export type OrderDineInInsert = typeof orderDineIn.$inferInsert
export type OrderDineInSelect = typeof orderDineIn.$inferSelect
