import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { user } from './identity'

export const invite = pgTable(
  'invite',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // AUD-01: hash SHA-256 do token secreto de aceite (nunca o valor em claro).
    // O token é devolvido UMA única vez no POST /invite. Nulo = convite legado
    // (pré-token), invalidado pela migration; aceite exige token válido.
    tokenHash: text('token_hash'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invite_company_email_idx').on(table.companyId, table.email),
    index('invite_pending_email_idx')
      .on(table.email)
      .where(sql`${table.acceptedAt} IS NULL`),
    index('invite_pending_token_hash_idx')
      .on(table.tokenHash)
      .where(sql`${table.acceptedAt} IS NULL`),
  ],
)
