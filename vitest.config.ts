import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { TEST_OWNER_URL, TEST_APP_URL } from './tests/support/test-urls.ts'

// CONVENÇÃO DE NOMES (um nome = um projeto):
//   *.spec.ts = unitário, 100% mockado, paralelo, sem banco, sem globalSetup;
//   *.test.ts = integração, PostgreSQL real, sequencial, globalSetup que aplica
//               db:migrate:full (o MESMO comando da produção/CI);
//   app/**    = componentes/páginas Vue no ambiente Nuxt (vitest.app.config.ts).
// Correr `npm run test:unit` paga só o arranque do vitest (~1s) em vez do
// drizzle-kit migrate (~1,4s) mais 40 ficheiros em série.
export default defineConfig({
  resolve: {
    alias: {
      '~~': import.meta.dirname,
      '#shared': resolve(import.meta.dirname, 'shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Mesma fonte do globalSetup (tests/support/test-urls.ts): sem isto o
    // DATABASE_URL do worker e o TEST_DB_URL do setup podiam apontar para
    // bancos diferentes e os testes corriam contra o errado em silêncio.
    env: {
      DATABASE_URL: TEST_OWNER_URL,
      APP_DATABASE_URL: TEST_APP_URL,
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['server/**/*.spec.ts', 'shared/**/*.spec.ts'],
          fileParallelism: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          globalSetup: ['./tests/support/test-setup.ts'],
          sequence: { shuffle: false },
          fileParallelism: false,
        },
      },
      // e2e: servidor Nitro real (build do nuxt via @nuxt/test-utils), cookies,
      // CSRF e fluxo Better Auth de verdade sobre HTTP. setupTimeout do
      // @nuxt/test-utils cobre o build (~120s); testTimeout 30s cobre o piso
      // de 700ms do register em cascata.
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.e2e.ts'],
          globalSetup: ['./tests/e2e/setup.ts'],
          sequence: { shuffle: false },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
      // Config próprio: o ambiente Nuxt precisa dos plugins do
      // @nuxt/test-utils, que só o defineVitestConfig deles monta.
      './vitest.app.config.ts',
    ],
  },
})
