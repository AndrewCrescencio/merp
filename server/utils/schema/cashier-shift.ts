import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'
import { user } from './identity'

export const cashierShift = pgTable(
  'cashier_shift',
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
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    openingFloat: numeric('opening_float', { precision: 12, scale: 2 }).notNull().default('0'),
    closingFloat: numeric('closing_float', { precision: 12, scale: 2 }),
    expectedAmount: numeric('expected_amount', { precision: 12, scale: 2 }),
    actualAmount: numeric('actual_amount', { precision: 12, scale: 2 }),
    difference: numeric('difference', { precision: 12, scale: 2 }),
    status: text('status').notNull().default('open'), // 'open', 'closed', 'reconciled'
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cashier_shift_company_id_idx').on(table.companyId),
    index('cashier_shift_location_id_idx').on(table.locationId),
    index('cashier_shift_user_id_idx').on(table.userId),
    index('cashier_shift_status_idx').on(table.status),
    index('cashier_shift_opened_at_idx').on(table.openedAt),
  ],
)

export type CashierShiftInsert = typeof cashierShift.$inferInsert
export type CashierShiftSelect = typeof cashierShift.$inferSelect
