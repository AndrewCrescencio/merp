// Única fonte das URLs de teste: o globalSetup (test-setup.ts) e o
// vitest.config.ts leem daqui — antes cada um tinha o seu valor hardcoded.
// Ordem: TEST_* explícita > env herdada (CI/compose) > default local.
// O CI sobrescreve só com env (DATABASE_URL/APP_DATABASE_URL), sem mexer aqui.
export const TEST_OWNER_URL =
  process.env.TEST_OWNER_URL ??
  process.env.TEST_DB_URL ??
  process.env.DATABASE_URL ??
  'postgres://merp:merp@localhost:5432/merp_test'

export const TEST_APP_URL =
  process.env.TEST_APP_URL ??
  process.env.APP_DATABASE_URL ??
  'postgres://merp_app:merp_app@localhost:5432/merp_test'

// A role superuser liga-se sempre ao database `postgres`: o `merp_test` pode
// nem existir ainda e é ela que o cria.
export const TEST_ADMIN_URL =
  process.env.TEST_ADMIN_URL ?? 'postgres://merp:merp@localhost:5432/postgres'
