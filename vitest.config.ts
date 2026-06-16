import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~~': resolve(__dirname),
      '@@': resolve(__dirname),
      '~': resolve(__dirname),
      '@': resolve(__dirname),
      '#shared': resolve(__dirname, 'shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.{spec,test}.ts', 'shared/**/*.{spec,test}.ts'],
  },
})
