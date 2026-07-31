Resolva a pendência #9 de `docs/pendencies.md` — rate limiter e lockout persistentes.

### Contexto

`checkRateLimit` e `checkAccountLockout`/`recordFailedAttempt` em
`server/utils/auth/helpers.ts` usam `Map` em memória: não persistem restart e não
funcionam com múltiplos workers/instâncias. Não há Redis no stack (docker-compose só tem
PostgreSQL) — **migre para Postgres**, sem adicionar dependências.

### 1. Schema — `server/utils/schema.ts`

Adicione uma tabela `auth_security_state` (drizzle, padrão das existentes):

- `key` text PK (ex.: `rate:user@example.com`, `lockout:user@example.com`)
- `count` integer NOT NULL default 0
- `lockedUntil` timestamp withTimezone NULL
- `resetAt` timestamp withTimezone NULL
- `updatedAt` timestamp withTimezone NOT NULL defaultNow

### 2. Migration

Gere a migration com `npx drizzle-kit generate` (aplica o diff do schema).

### 3. Refactor de `server/utils/auth/helpers.ts`

- Extraia a **lógica pura de decisão** em funções exportadas e testáveis, ex.:
  - `evaluateRateLimit(entry, now): { allowed: boolean; retryAfter?: number; nextCount: number; nextResetAt: number }` — janela deslizante de 60s, máximo 5 requisições por email (FR-010).
  - `evaluateLockout(failedAttempts, lockedUntil, now): { locked: boolean; nextAttempts: number; nextLockedUntil: number | null }` — 10 falhas → lockout 30min.
- Troque os `Map` por operações no banco via `db` (`server/utils/db.ts`) com **upsert**
  (`onConflictDoUpdate`), usando a chave `rate:<email>` / `lockout:<email>`.
- As funções `checkRateLimit`, `checkAccountLockout`, `recordFailedAttempt`,
  `resetFailedAttempts` devem virar **assíncronas** (devem ser `await`-adas).
- Mantenha a resposta 429 com os headers `Retry-After`, `RateLimit-Reset`,
  `RateLimit-Remaining` e o erro `rate_limit_exceeded`, e o 401 `account_locked` (já
  tratado na pendência #2).
- Remova o `setInterval` de limpeza do Map (o banco cuida disso via `resetAt`).

### 4. Atualize consumidores

Em `server/api/auth/login.post.ts` (e `register.post.ts` se usar rate limit), `await`
as funções de helpers.

### 5. Testes

- Specs unitários para `evaluateRateLimit` e `evaluateLockout` (lógica pura).
- Atualize `server/api/auth/login.post.spec.ts` (mocks agora assíncronos).
- Integração em `server/utils/auth/helpers.test.ts` (ou `repository.test.ts`): com DB
  disponível, falhas consecutivas → lockout; após resetAt, volta a permitir.

### Verificação

```bash
npx vitest run server/utils/auth/ server/api/auth/login.post.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
