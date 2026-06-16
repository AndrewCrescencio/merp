import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core'

export const user = pgTable(
  'user',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    isActive: boolean('is_active').notNull().default(true),
    consentTermsVersion: text('consent_terms_version'),
    consentTermsAcceptedAt: timestamp('consent_terms_accepted_at', { withTimezone: true }),
    consentWithdrawnAt: timestamp('consent_withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_email_idx').on(table.email),
    index('user_is_active_idx').on(table.isActive),
  ],
)

export const session = pgTable(
  'session',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    rememberMe: boolean('remember_me').notNull().default(false),
    activeCompanyId: text('active_company_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('session_token_idx').on(table.token),
    index('session_user_id_idx').on(table.userId),
    index('session_expires_at_idx').on(table.expiresAt),
  ],
)

export const account = pgTable(
  'account',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const authEvent = pgTable(
  'auth_event',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id'),
    email: text('email').notNull(),
    eventType: text('event_type').notNull(),
    ipAddress: text('ip_address'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('auth_event_user_id_idx').on(table.userId),
    index('auth_event_email_idx').on(table.email),
    index('auth_event_event_type_idx').on(table.eventType),
    index('auth_event_created_at_idx').on(table.createdAt),
  ],
)

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('company_member_company_user_idx').on(table.companyId, table.userId),
    index('company_member_user_id_idx').on(table.userId),
    index('company_member_company_id_idx').on(table.companyId),
  ],
)
