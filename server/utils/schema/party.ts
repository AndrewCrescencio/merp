import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'

export const party = pgTable(
  'party',
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
    type: text('type').notNull(), // 'customer' | 'supplier'
    document: text('document'), // CPF/CNPJ
    email: text('email'),
    phone: text('phone'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('party_company_id_idx').on(table.companyId),
    index('party_location_id_idx').on(table.locationId),
    index('party_type_idx').on(table.type),
    uniqueIndex('party_company_document_idx').on(table.companyId, table.document),
    index('party_is_active_idx').on(table.isActive),
  ],
)

export type PartyInsert = typeof party.$inferInsert
export type PartySelect = typeof party.$inferSelect
