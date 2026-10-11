import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, numeric, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'
import { order } from './order'
import { product } from './product'

export const orderItem = pgTable(
  'order_item',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => product.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
    taxSnapshot: text('tax_snapshot').notNull(), // JSON com alíquotas
    bomSnapshot: text('bom_snapshot').notNull(), // JSON com composição
    discountApplied: numeric('discount_applied', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).generatedAlwaysAs(
      sql`round_half_up(unit_price * quantity - discount_applied)`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('order_item_company_id_idx').on(table.companyId),
    index('order_item_location_id_idx').on(table.locationId),
    index('order_item_order_id_idx').on(table.orderId),
    index('order_item_product_id_idx').on(table.productId),
  ],
)

export type OrderItemInsert = typeof orderItem.$inferInsert
export type OrderItemSelect = typeof orderItem.$inferSelect
