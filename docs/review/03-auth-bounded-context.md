# Parte 3: Auth Bounded Context — Relatório de Revisão

## Escopo

- `server/api/auth/` — 28 handlers (login, register, logout, me, verify-email, forget-password, reset-password, send-verification-email, deactivate, companies CRUD, invites, consent)
- `server/utils/auth/identity/` — `queries.ts` (signInUser, registerUser, verifyEmailBA, resetPasswordBA, etc.), `client.ts` (callBetterAuth wrapper)
- `shared/auth.ts` — Better Auth config (session, email/password, emailVerification, cookies, CORS)
- `server/middleware/auth.ts` — Session validation, rate limiting, auth event emission
- `server/utils/shared/security.ts` — Rate limit (sliding window), lockout (dual-tier), password validation
- `server/utils/shared/validate.ts` — Input validation for all auth endpoints

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Bugs/Falhas** | ⚠️     | `searchCompanies` method chamado em handler mas não existe no repository; timing attack protection (`runTimingPad`) complexo mas funcional; `background` fire-and-forget pode perder auditoria em serverless; reset password não invalida sessões existentes (Better Auth config `revokeSessionsOnPasswordReset: true` mas handler não aguarda)                                                            |
| **R2 — Segurança**   | ✅     | Boas práticas: rate limit sliding window (IP 20/min, email 5/min, user 60/min), lockout dual-tier (par 10 + global 50), anti-enumeração (register sempre 201, login 401 genérico), email verification obrigatório, passwords bcrypt (Better Auth), HIBP breach check, CNPJ validação, CSRF double-submit, cookies httpOnly/Secure/SameSite=Lax, fail-closed auth init (503), RLS backstop em todas queries |

---

## Achados

### P03-A01 — BUG: `searchCompanies` method não existe no `MembershipRepository`

- **Tipo**: Bug
- **Severidade**: **Alta**
- **Confiança**: Alta
- **Arquivo**: `server/api/auth/companies.get.ts:8`, `server/utils/auth/company/membership.ts` (ausente)
- **Evidência**: Handler `companies.get.ts` linha 8 chama `membershipRepository.searchCompanies(q, user.id)` mas o método **não existe** no `MembershipRepository` (arquivo tem 168 linhas, métodos: `createCompanyMember`, `findUserCompanies`, `isCompanyMember`, `getCompanyMembershipRole`, `removeCompanyMember`, `setActiveCompany`, `getActiveCompany`). Testes em `repository.test.ts:118,122,147` também chamam método inexistente.
- **Impacto**: Endpoint `GET /api/auth/companies` falha com 500 (method undefined). Testes falham.
- **Correção**: Adicionar método `searchCompanies(query: string, userId: string)` no `MembershipRepository` similar a `findUserCompanies` mas com filtro `ILIKE` em `name`/`cnpj` usando `escapeLikePattern`.

### P03-A02 — `runTimingPad` cria e revoga sessão fantasma (race condition teórico)

- **Tipo**: Bug / Segurança
- **Severidade**: Média
- **Confiança**: Média
- **Arquivo**: `server/utils/auth/identity/queries.ts:48-69`
- **Evidência**: `runTimingPad` faz `signInEmail` com senha fixa `__aud07_timing_pad__` → se Better Auth criar sessão (ex.: conta existe mas senha errada), tenta revogar via `revokeSession`. Janela entre criação e revogação: sessão válida existe brevemente. Em alta concorrência, attacker poderia capturar cookie?
- **Impacto**: Baixo risco prático (senha errada → Better Auth não cria sessão; senha fixa nunca casa). Mas complexidade desnecessária.
- **Correção**: Simplificar — `signInEmail` com senha errada já gasta tempo de scrypt (timing pad natural). Remover `runTimingPad` e `handleDeactivatedAccount` timing pad; apenas logar tentativa.

### P03-A03 — `background` fire-and-forget perde auditoria em serverless/edge

- **Tipo**: Bug (operacional)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/utils/shared/background.ts:11-41`, `server/middleware/auth.ts:59-72`, `server/api/auth/login.post.ts:133-142`
- **Evidência**: `background` usa `event.waitUntil` se disponível (workers/edge) senão `void guarded` (detached promise). Comentário linha 8: "safe on long-lived Node processes only". Em serverless (Vercel, Cloudflare, AWS Lambda), processo morre após response → promise órfã não executa → **auditoria perdida** (login, session_validated, session_invalidated).
- **Impacto**: Logs de auditoria incompletos em deploy serverless. Não afeta segurança direta mas viola compliance (LGPD Art. 37 - registros de acesso).
- **Correção**:
  1. Documentar que `background` só garante execução em Node long-lived (Docker, VM)
  2. Para serverless, usar `event.waitUntil` (Nuxt/Nitro suporta) ou mover auditoria para queue persistente (ex.: `email_queue` table + worker)
  3. Adicionar teste de integração que verifica persistência de `auth_event` após response

### P03-A04 — Reset password não aguarda revogação de sessões (Better Auth config ok, handler não sincroniza)

- **Tipo**: Bug / Segurança
- **Severidade**: Baixa
- **Confiança**: Média
- **Arquivo**: `shared/auth.ts:46` (`revokeSessionsOnPasswordReset: true`), `server/utils/auth/identity/queries.ts:251-273` (`resetPasswordBA`)
- **Evidência**: Better Auth config tem `revokeSessionsOnPasswordReset: true` — ao resetar senha, Better Auth invalida sessões. Mas `resetPasswordBA` chama `auth.api.resetPassword` e retorna imediatamente. Não verifica se sessões foram revogadas. Se chamado via API, cliente pode ter sessão ainda válida até próximo request (middleware valida).
- **Impacto**: Janela curta (até próximo request autenticado) onde sessão antiga funciona. Mitigado por middleware que chama `getSession` a cada request.
- **Correção**: Opcional — aguardar confirmação de revogação ou documentar que middleware garante invalidade no próximo request.

### P03-A05 — Rate limit por email no login usa email normalizado ANTES de validar existência (OK — anti-enumeração)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/api/auth/login.post.ts:50-75`, `server/utils/shared/security.ts:224`
- **Evidência**: `normalizeEmail` → `checkEmailRateLimit` → `checkAccountLockout` → `signInUser`. Rate limit aplica **antes** de saber se conta existe. Register também usa `checkEmailRateLimit` (linha 32). Ambos retornam 429 genérico sem vazar existência.
- **Nota**: Design correto — anti-enumeração mantido.

### P03-A06 — Lockout dual-tier (par 10 + global 50) com FOR UPDATE transacional (OK — previne TOCTOU)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/shared/security.ts:235-317`
- **Evidência**: `pairLockoutKey(email, ip)` → `lockout:email:ip` (limiar 10) + `lockout:email` global (limiar 50). `readLockout` e `incrementLockout` usam `db.transaction` + `.for('update')` → lock de linha previne race condition entre requests concorrentes.
- **Nota**: Bem implementado. `resetFailedAttempts` limpa ambos tiers após login sucesso (best-effort, não falha login se erro).

### P03-A07 — `checkIpRateLimit` roda ANTES de `readBody` em rotas públicas (OK — previne DoS com body grande)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/api/auth/login.post.ts:46`, `server/api/auth/register.post.ts:21`, `server/utils/shared/security.ts:206-219`
- **Evidência**: `await checkIpRateLimit(event)` antes de `readBody`. Bloqueia 20 req/min por IP sem parsear body. Login/register/forget-password/send-verification-email/reset-password/verify-email todos seguem padrão.

### P03-A08 — Email verification obrigatório no login (`requireEmailVerification: true` + `sendOnSignIn: true`)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `shared/auth.ts:43,58`, `server/api/auth/login.post.ts:177-188`
- **Evidência**: Better Auth config `requireEmailVerification: true` + `sendOnSignIn: true`. Login com senha correta mas email não verificado → 403 `email_not_verified` (exceção deliberada ao 401 genérico, só alcançado com senha CORRETA → não vaza existência). Reenvia link automaticamente.

### P03-A09 — `CORS_ORIGIN` baked no build + validada em runtime (fail-closed)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `nuxt.config.ts:9-13,23`, `shared/auth.ts:8-11`, `docker-compose.prod.yml:13,21-24`
- **Evidência**: Build falha se `NODE_ENV=production` e `CORS_ORIGIN` não setada. Runtime valida em `shared/auth.ts` e `validate-env.ts`. Prod compose usa `${CORS_ORIGIN:?}` (fail-closed). `trustedOrigins` do Better Auth = `[corsOrigin]`.

### P03-A10 — `BETTER_AUTH_SECRET` mínimo 32 chars validado no boot (fail-closed)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/plugins/validate-env.ts` (testado em `validate-env.spec.ts:30-46`), `shared/auth.ts` (usa secret), `docker-compose.prod.yml:17`
- **Evidência**: `missingProductionEnv` flagga `BETTER_AUTH_SECRET (mínimo 32 caracteres)` se length < 32. Prod compose exige a var.

### P03-A11 — CNPJ validação com dígitos verificadores (Receita Federal)

- **Tipo**: Segurança / Data integrity (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/shared/security.ts:39-54`, `server/api/auth/companies.post.ts:22-24`, `server/api/auth/companies.update.post.ts:30-32`
- **Evidência**: `isValidCnpj` implementa módulo 11, rejeita sequências repetidas, aceita com/sem máscara. Aplicado em create/update company.

### P03-A12 — Password breach check (HIBP k-anonymity) no register/reset-password

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/shared/hibp.ts`, `server/utils/shared/validate.ts:73-78`, `server/api/auth/reset-password.post.ts:22-27`
- **Evidência**: `checkPasswordBreach` usa API `pwnedpasswords.com/range/` (k-anonymity: só prefixo SHA-1 de 5 chars). Fail-open em erro de rede (não bloqueia usuário). Aplicado em `validateRegisterInput` e `reset-password.post.ts`.

### P03-A13 — Invite token: 256-bit entropy, SHA-256 hash stored, single-use via conditional UPDATE

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/auth/invite/repository.ts:36-45,132-206`, `drizzle/0014_bootstrap_role_split.sql:21-29`
- **Evidência**: `generateToken()` → 32 bytes base64url (256 bits). `hashToken` = SHA-256 hex. Stored `tokenHash` apenas. `acceptInvite`: lookup por `tokenHash` + `email` + `acceptedAt IS NULL` + `expiresAt > now()` com GUC `app.invite_token_hash`. Claim atômico: `UPDATE invite SET acceptedAt=now() WHERE id=? AND acceptedAt IS NULL AND expiresAt > now()` → race-safe. Se claim perdido (concorrência) → 404 genérico, token NÃO consumido (pode retry).

### P03-A14 — Company creation: founder bootstrap flag `allow_founder_bootstrap` + RLS backstop

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/auth/company/repository.ts:52-83`, `drizzle/0014_bootstrap_role_split.sql:17-19`
- **Evidência**: `createCompanyWithOwner` seta `app.allow_founder_bootstrap=true` no mesmo transaction → policy `cm_insert_policy` permite self-insert `role='owner'` SÓ com flag. Sem flag, RLS nega. Flag não persiste (transaction-local).

### P03-A15 — Session cookie: httpOnly, Secure (prod), SameSite=Lax, prefix `merp-`

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `shared/auth.ts:69-78`
- **Evidência**: Cookie `merp-session_token` com `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`. Prefixo `merp-` evita colisão.

---

## Pontos Fortes

- **Defesa em profundidade**: Rate limit (nginx IP + app IP + app email + app user), Lockout (par + global), RLS (DB) + `withTenant` (app) + membership check (app)
- **Anti-enumeração consistente**: Register 201 sempre, Login 401 genérico, Reset/Forgot 200 sempre
- **Timing attack mitigations**: `normalizeEmail` antes de rate limit, `runTimingPad` (mesmo que complexo), HIBP check assíncrono
- **Auditoria abrangente**: `auth_event` para login, register, logout, session_created, session_validated, session_expired, session_invalidated, invite_created, invite_accepted, company_created, company_updated, company_deleted, deactivation
- **Fail-closed em todos os níveis**: Build (CORS_ORIGIN), Runtime (validate-env), DB (RLS + GUCs NULLIF), Middleware (auth_unavailable 503)

---

## Sinais para Roadmap

- **P0**: Implementar `searchCompanies` no `MembershipRepository` (quebra endpoint companies.get)
- **P1**: Simplificar `runTimingPad` / remover se desnecessário
- **P1**: Auditoria persistente para serverless (queue + worker ou `event.waitUntil` garantido)
- **P2**: 2FA (removido do escopo — ADR-010, landmine adapter × RLS; critério: feature flag + migration dedicada + testes RLS com `app.location_id`)

---

## Não Verificado / Dúvidas

- Execução real do fluxo de email (Resend) — `sendVerificationEmailBA`/`requestPasswordResetBA` são no-op (log only) no código atual
- `consent/withdraw.post.ts` — não revisto (assume similar a deactivate)
- `export.get.ts` — LGPD data export, não revisto
- Testes de integração reais com Docker (precisa ambiente)
