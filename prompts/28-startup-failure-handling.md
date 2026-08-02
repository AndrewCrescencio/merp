> **ESTADO (2026-08-02):** ✅ resolvido (commit `a570122`). Pendência #14 de
> `docs/pendencies.md` implementada — `shared/auth.ts` com inicialização lazy +
> cache de promise (`getAuth()`, `isAuthAvailable()`); consumidores ajustados
> (`repository.ts`, `middleware/auth.ts`, `logout.post.ts`); novo `GET /api/health`
> público (200, `auth`/`db` ready/unavailable). Desvios: (a) helper
> `sendAuthUnavailableError()` em `server/utils/auth/helpers.ts` em vez do
> `createError` inline (mesmo contrato JSON `{ error: 'auth_unavailable', message }`,
> DRY entre middleware/repositório/logout); (b) `/api/health` adicionado às rotas
> públicas do middleware (necessário para o health check funcionar sem auth);
> (c) `server/api/auth/register.post.spec.ts` tem mock morto de `#shared/auth`
> (o handler nunca importou o módulo) — mantido inofensivo. Testes de integração
> (`.test.ts`) falham por ambiente (DB/role) — pré-existente, confirmado com
> stash sem as alterações.

Resolva a pendência #14 de `docs/pendencies.md` — startup failure handling (FR-025).

### Contexto

Se a inicialização do Better Auth em `shared/auth.ts` falhar, os endpoints de auth devem
retornar 503 `auth_unavailable`. Hoje `auth` é criado no topo do módulo (falha na hora de
importar) e não há graceful degradation nem health check.

### Alterações

1. Em `shared/auth.ts` — troque a inicialização direta por **inicialização lazy com
   cache de promise**:

   ```typescript
   let authPromise: Promise<Auth> | null = null

   export function getAuth(): Promise<Auth> {
     if (!authPromise) {
       authPromise = (async () =>
         betterAuth({
           /* config atual */
         }))()
     }
     return authPromise
   }

   export async function isAuthAvailable(): Promise<boolean> {
     try {
       await getAuth()
       return true
     } catch (error) {
       logger.error('Better Auth initialization failed', { error: String(error) })
       return false
     }
   }
   ```

   Exporte também `auth` (o resultado resolvido) para compatibilidade, ou ajuste os
   consumidores para `await getAuth()` — **ajuste os consumidores** (`server/utils/auth/repository.ts`, `server/middleware/auth.ts`) para usar `getAuth()`.

2. Em `server/utils/auth/repository.ts` — em `register` e `signIn`, resolva a instância
   via `await getAuth()` dentro do `try`. Se a resolução falhar, lance 503:

```typescript
throw createError({
  status: 503,
  statusText: '503',
  message: JSON.stringify({
    error: 'auth_unavailable',
    message: 'Authentication service is starting. Please try again.',
  }),
})
```

3. Em `server/middleware/auth.ts` — envolva `getSession` com tratamento: se a instância
   não puder ser resolvida, responda 503 `auth_unavailable` em vez de 401.

4. Crie `GET /api/health` (`server/api/health.get.ts`) — sem exigir auth:

```json
{
  "status": "ok",
  "auth": "ready" | "unavailable",
  "db": "ok" | "unavailable"
}
```

Use `isAuthAvailable()` e um teste simples de conexão com `db` (ex.:
`db.execute(sql`SELECT 1``)`) dentro de try/catch.

### Testes

- Spec co-localizado `server/api/health.get.spec.ts`: `auth` disponível → `ready`;
  indisponível (mock de `isAuthAvailable` falso) → `unavailable`, status 200.
- Atualize os specs afetados (`server/middleware/auth.spec.ts`, `login.post.spec.ts` se
  necessário) para o novo import `getAuth`.

### Verificação

```bash
npx vitest run server/api/health.get.spec.ts server/middleware/auth.spec.ts
npm run lint
npm run format:check
npm run dev  # manual: GET /api/health
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
