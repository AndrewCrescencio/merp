import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'
import { party } from './party'

export const order = pgTable(
  'order',
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
    orderType: text('order_type').notNull(), // 'dine_in', 'takeout'
    status: text('status').notNull().default('open'), // 'open', 'completed', 'cancelled'
    customerId: text('customer_id').references(() => party.id, { onDelete: 'set null' }),
    partyId: text('party_id').references(() => party.id, { onDelete: 'set null' }),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    createdBy: text('created_by').notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('order_company_id_idx').on(table.companyId),
    index('order_location_id_idx').on(table.locationId),
    index('order_status_idx').on(table.status),
    index('order_created_by_idx').on(table.createdBy),
    uniqueIndex('order_company_idempotency_key_idx').on(table.companyId, table.idempotencyKey),
  ],
)

export type OrderInsert = typeof order.$inferInsert
export type OrderSelect = typeof order.$inferSelect
