import { describe, it, expect } from 'vitest'
import { db, createOwnerDbForSetupOnly } from './db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)(
  'Grants parity — merp_app has required grants on all user tables',
  () => {
    const ownerDb = createOwnerDbForSetupOnly()

    it('merp_app has SELECT, INSERT, UPDATE, DELETE on all non-system tables', async () => {
      // Query information_schema for tables where merp_app lacks required grants
      const missingGrants = await ownerDb.execute(sql`
      SELECT
        t.table_name,
        string_agg(
          CASE
            WHEN p.privilege_type IS NULL THEN 'MISSING: ' || required.priv
            ELSE NULL
          END,
          ', '
        ) AS missing_privileges
      FROM information_schema.tables t
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
      ) AS required(priv)
      LEFT JOIN information_schema.table_privileges p
        ON p.table_schema = t.table_schema
        AND p.table_name = t.table_name
        AND p.grantee = 'merp_app'
        AND p.privilege_type = required.priv
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        -- Exclude system/internal tables
        AND t.table_name NOT IN ('__drizzle_migrations', 'drizzle.__migrations')
        AND p.privilege_type IS NULL
      GROUP BY t.table_name
      HAVING COUNT(*) > 0
    `)

      // Convert to readable format
      const missing = (missingGrants as any[]).map((row) => ({
        table: row.table_name,
        missing: row.missing_privileges,
      }))

      if (missing.length > 0) {
        console.error('GRANTS PARITY FAILURE - Tables missing grants for merp_app:')
        missing.forEach((m) => console.error(`  ${m.table}: ${m.missing}`))
      }

      expect(missing).toHaveLength(0)
    })

    it('merp_app has USAGE, SELECT on all sequences', async () => {
      const missingGrants = await ownerDb.execute(sql`
      SELECT
        s.sequence_name,
        string_agg(
          CASE
            WHEN p.privilege_type IS NULL THEN 'MISSING: ' || required.priv
            ELSE NULL
          END,
          ', '
        ) AS missing_privileges
      FROM information_schema.sequences s
      CROSS JOIN LATERAL (
        VALUES ('USAGE'), ('SELECT')
      ) AS required(priv)
      LEFT JOIN information_schema.usage_privileges p
        ON p.object_schema = s.sequence_schema
        AND p.object_name = s.sequence_name
        AND p.grantee = 'merp_app'
        AND p.privilege_type = required.priv
      WHERE s.sequence_schema = 'public'
        AND p.privilege_type IS NULL
      GROUP BY s.sequence_name
      HAVING COUNT(*) > 0
    `)

      const missing = (missingGrants as any[]).map((row) => ({
        sequence: row.sequence_name,
        missing: row.missing_privileges,
      }))

      if (missing.length > 0) {
        console.error('GRANTS PARITY FAILURE - Sequences missing grants for merp_app:')
        missing.forEach((m) => console.error(`  ${m.sequence}: ${m.missing}`))
      }

      expect(missing).toHaveLength(0)
    })

    it('DEFAULT PRIVILEGES are set for merp_app on tables and sequences', async () => {
      // Verify default privilege entries exist in pg_default_acl
      // defaclobjtype: 'r' = tables, 'S' = sequences
      // defaclrole is the role that SET the default privileges (merp/owner), not the recipient
      const result = await ownerDb.execute(sql`
      SELECT defaclobjtype
      FROM pg_default_acl
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'merp')
        AND defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND (
          defaclacl @> ARRAY['merp_app=arwd/merp']::aclitem[]
          OR defaclacl @> ARRAY['merp_app=rU/merp']::aclitem[]
        )
    `)

      const types = (result as any[]).map((row) => row.defaclobjtype).sort()
      // Should have 'r' (tables) and 'S' (sequences)
      expect(types).toEqual(['S', 'r'])
    })

    it('new table created by owner inherits merp_app grants via DEFAULT PRIVILEGES', async () => {
      const testTable = 'test_grants_parity_' + Date.now()

      // Create table as owner (bypasses RLS)
      await ownerDb.execute(
        sql`CREATE TABLE ${sql.identifier(testTable)} (id serial primary key, name text)`,
      )

      // Check merp_app has grants on the new table
      const grants = await ownerDb.execute(sql`
      SELECT privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name = ${testTable}
        AND grantee = 'merp_app'
        AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    `)

      const grantTypes = (grants as any[]).map((g) => g.privilege_type).sort()
      expect(grantTypes).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])

      // Cleanup
      await ownerDb.execute(sql`DROP TABLE ${sql.identifier(testTable)}`)
    })
  },
)
