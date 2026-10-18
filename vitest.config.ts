import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { TEST_OWNER_URL, TEST_APP_URL } from './server/utils/test-urls.ts'

// Duas velocidades, pelo motivo certo: os specs unitários são 100% mockados e
// podem correr em paralelo sem globalSetup; os testes de integração partilham
// um único PostgreSQL e semeiam ids fixos, por isso ficam sequenciais e com o
// bootstrap da base de dados. Correr `npm run test:unit` paga só o arranque do
// vitest (~1s) em vez do drizzle-kit migrate (~1,4s) mais 40 ficheiros em série.
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
    // Mesma fonte do globalSetup (server/utils/test-urls.ts): sem isto o
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
          globalSetup: [],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          globalSetup: ['./server/utils/test-setup.ts'],
          sequence: { shuffle: false },
          fileParallelism: false,
        },
      },
    ],
  },
})
