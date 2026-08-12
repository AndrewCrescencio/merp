import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// AUD-05: em produção o tráfego de banco é fail-closed — sslmode=require
// (postgres-js mapeia p/ a opção ssl). Se a URL já fixar um modo explícito
// (require/verify-ca/verify-full), respeita; senão força require. Dev local
// (postgres docker sem TLS) fica inalterado. Nota: sslmode=require criptografa
// sem pinning de CA; para verificação de certificado, fixe sslmode=verify-full
// na própria DATABASE_URL do deploy.
const SslUpgrade = new Set(['disable', 'no', 'allow', 'prefer'])

export function withRequiredSsl(url: string): string {
  if (process.env.NODE_ENV !== 'production') return url
  const parsed = new URL(url)
  const current = parsed.searchParams.get('sslmode')
  if (current === null || SslUpgrade.has(current)) {
    parsed.searchParams.set('sslmode', 'require')
  }
  return parsed.toString()
}

const connectionString = process.env.APP_DATABASE_URL || process.env.DATABASE_URL!
const queryClient = postgres(withRequiredSsl(connectionString))
export const db = drizzle(queryClient, { schema })
