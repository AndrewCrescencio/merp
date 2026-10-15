import { defineNitroPlugin } from 'nitropack/runtime'
import { parseTrustedProxyCidrs } from '~~/server/utils/shared'

// AUD-05 + AUD-11 + AUD-24: fail-fast no boot (NODE_ENV=production). Sem
// essas envs o app operaria com fallback localhost silencioso em CORS/baseURL,
// com TRUST_PROXY=true sem proxy confiável, com secret de assinatura fraca
// (tokens de verificação/reset forjáveis), ou — pior — como a role OWNER do
// banco (APP_DATABASE_URL ausente bypassaria RLS nas tabelas sem FORCE e
// contradiz a postura fail-closed do AUD-05). Recusa subir em vez disso.
export function missingProductionEnv(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return []

  const missing: string[] = []
  if (!env.CORS_ORIGIN) missing.push('CORS_ORIGIN')
  if (!env.BETTER_AUTH_URL) missing.push('BETTER_AUTH_URL')
  if (!env.APP_DATABASE_URL) missing.push('APP_DATABASE_URL')
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    missing.push('BETTER_AUTH_SECRET (mínimo 32 caracteres)')
  }
  if (env.TRUST_PROXY === 'true' && parseTrustedProxyCidrs(env.TRUSTED_PROXY_CIDRS).length === 0) {
    missing.push('TRUSTED_PROXY_CIDRS (obrigatória quando TRUST_PROXY=true)')
  }
  // requireEmailVerification=true: sem chave/remetente o email nunca sai, a
  // conta nasce não-verificada e o login trava em 403 para sempre. Melhor
  // recusar o boot do que operar um signup que não se completa (o envio é
  // best-effort dentro do request, mas não é opcional no produto).
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    missing.push('RESEND_API_KEY/RESEND_FROM (verificação de email obrigatória)')
  }
  return missing
}

export default defineNitroPlugin(() => {
  const missing = missingProductionEnv(process.env)
  if (missing.length > 0) {
    throw new Error(
      `Falha de inicialização: env obrigatória ausente em produção: ${missing.join(', ')}. ` +
        'Configure antes do deploy — boot recusado para evitar operação com fallback localhost.',
    )
  }
})
