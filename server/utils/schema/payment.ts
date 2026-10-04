import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'
import { order } from './order'

export const payment = pgTable(
  'payment',
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
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    method: text('method').notNull(), // 'cash', 'card', 'pix', 'voucher'
    status: text('status').notNull().default('pending'), // 'pending', 'approved', 'refunded', 'failed'
    providerRef: text('provider_ref'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payment_company_id_idx').on(table.companyId),
    index('payment_location_id_idx').on(table.locationId),
    index('payment_order_id_idx').on(table.orderId),
    index('payment_status_idx').on(table.status),
    uniqueIndex('payment_company_idempotency_key_idx').on(table.companyId, table.idempotencyKey),
  ],
)

export type PaymentInsert = typeof payment.$inferInsert
export type PaymentSelect = typeof payment.$inferSelect
