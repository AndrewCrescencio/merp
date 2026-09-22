import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~~': resolve(__dirname),
      '#shared': resolve(__dirname, 'shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: 'postgres://merp:merp@localhost:5432/merp_test',
      APP_DATABASE_URL: 'postgres://merp_app:merp_app@localhost:5432/merp_test',
    },
    include: ['server/**/*.{spec,test}.ts', 'shared/**/*.{spec,test}.ts'],
    globalSetup: ['./server/utils/test-setup.ts'],
  },
})
