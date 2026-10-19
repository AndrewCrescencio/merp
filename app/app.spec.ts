import { expect, test } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from './app.vue'

// Smoke do projeto "app": prova que o ambiente Nuxt (router, auto-imports,
// runtime config, middleware) arranca dentro do vitest. Rota pública porque o
// auth.global.ts fetch a /api/v1/me em rotas protegidas e o mini-Nuxt não tem
// server. É a base para os próximos specs de componentes e páginas — sem ele,
// um erro de ambiente só aparecesse no primeiro teste de verdade.
test('ambiente Nuxt arranca: app.vue monta e renderiza a página pública', async () => {
  const component = await mountSuspended(App, { route: '/auth/login' })
  expect(component.find('input').exists()).toBe(true)
})
