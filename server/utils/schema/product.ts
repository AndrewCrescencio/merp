import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'

export const product = pgTable(
  'product',
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
    name: text('name').notNull(),
    sku: text('sku'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
    taxRuleId: text('tax_rule_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('product_company_id_idx').on(table.companyId),
    index('product_location_id_idx').on(table.locationId),
    uniqueIndex('product_company_sku_idx').on(table.companyId, table.sku),
    index('product_is_active_idx').on(table.isActive),
  ],
)

export type ProductInsert = typeof product.$inferInsert
export type ProductSelect = typeof product.$inferSelect
