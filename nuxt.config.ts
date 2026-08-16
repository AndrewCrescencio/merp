// https://nuxt.com/docs/api/configuration/nuxt-config
// AUD-05: o header CORS é baked no build pelo Nitro — sem a env, produção
// compilaria com fallback localhost silencioso. Falha explícita no build.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  throw new Error('Falha de build: CORS_ORIGIN é obrigatória em produção (sem fallback localhost).')
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/eslint'],

  nitro: {
    errorHandler: '~~/server/error-handler',
    imports: {
      dirs: ['server/utils/auth'],
    },
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      '0 0 * * *': ['purge-sessions', 'purge-security-state', 'purge-auth-events'],
    },
  },

  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
    },
  },
})
