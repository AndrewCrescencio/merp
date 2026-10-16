import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { user } from './identity'
import { location } from './location'

export const company = pgTable(
  'company',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    cnpj: text('cnpj'),
    razaoSocial: text('razao_social'),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('company_cnpj_idx').on(table.cnpj),
    index('company_is_deleted_idx').on(table.isDeleted),
    index('company_name_idx').on(table.name),
  ],
)

export const companyMember = pgTable(
  'company_member',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    // ADR-002 §Consequências — fonte do location no escopo do membro. NULL é um
    // estado legítimo: significa "sem location definido" e o chamador cai no
    // escopo company, que a RLS já permite via `OR get_location_id() IS NULL`.
    defaultLocationId: text('default_location_id').references(() => location.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('company_member_company_user_idx').on(table.companyId, table.userId),
    index('company_member_user_id_idx').on(table.userId),
    index('company_member_company_id_idx').on(table.companyId),
    index('company_member_default_location_id_idx').on(table.defaultLocationId),
  ],
)
