import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { company } from './company'

export const location = pgTable(
  'location',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('location_company_id_idx').on(table.companyId),
    index('location_is_active_idx').on(table.isActive),
  ],
)

export type LocationInsert = typeof location.$inferInsert
export type LocationSelect = typeof location.$inferSelect
