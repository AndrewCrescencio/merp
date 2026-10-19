import { defineVitestConfig } from '@nuxt/test-utils/config'

// Projeto "app": componentes/páginas Vue com o ambiente Nuxt real (router,
// auto-imports, runtime config) via @nuxt/test-utils. Separa do projeto unit
// porque monta um Nuxt mínimo (~10s) — unitário continua instantâneo.
export default defineVitestConfig({
  test: {
    name: 'app',
    environment: 'nuxt',
    include: ['app/**/*.spec.ts'],
  },
})
