// https://nuxt.com/docs/api/configuration/nuxt-config
// AUD-05: o header CORS é baked no build pelo Nitro — sem a env, produção
// compilaria com fallback localhost silencioso. Falha explícita no build.
// Escopo: SÓ no build (`nuxt build`/`generate`). `nuxt prepare` (roda no
// postinstall), eslint e vitest importam este arquivo sem compilar nada —
// exigir a env neles quebraria install/lint/test em checkouts sem .env.
// O boot em produção sem CORS_ORIGIN continua recusado pelo
// server/plugins/validate-env.ts + shared/auth.ts (fail-closed em runtime).
const invoking = `${process.env.npm_lifecycle_event ?? ''} ${process.argv.join(' ')}`
const isBuild = /(^|\s)(build|generate)\b/.test(invoking)
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN && isBuild) {
  throw new Error('Falha de build: CORS_ORIGIN é obrigatória em produção (sem fallback localhost).')
}

export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  devtools: { enabled: true },

  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        // x-csrf-token: exigido pelos POSTs autenticados (double-submit) —
        // sem ele o preflight do navegador bloqueia logout/companies/invite.
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
        'Access-Control-Allow-Credentials': 'true',
      },
    },
  },

  compatibilityDate: '2025-07-15',

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
      '*/5 * * * *': ['process-email-queue'],
    },
  },

  eslint: {
    config: {
      typescript: true,
      stylistic: true,
    },
  },
})
