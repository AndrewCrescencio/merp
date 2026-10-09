# Parte 8: Middleware/Shared/Error Handling — Relatório de Revisão

## Escopo

- `server/middleware/` — `00-no-store.ts`, `01-csrf-token.ts`, `02-csrf-validate.ts`, `auth.ts`, `pii-audit.ts`
- `server/utils/shared/` — `csrf.ts`, `ip.ts`, `security.ts`, `validate.ts`, `errors.ts`, `audit.ts`, `background.ts`, `email.ts`, `hibp.ts`, `purge.ts`, `handler.ts`, `index.ts`
- `server/error-handler.ts` — Nitro error handler global
- `server/plugins/validate-env.ts` — Validação de env no boot

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                                                                                                         |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Bugs/Falhas** | ⚠️     | `event.context.auth` não setado no middleware (bug crítico P05/P06/P07); `background` fire-and-forget perde auditoria em serverless; `validate-env` não testa `CSRF_SECRET` length; `purge.ts` não revisado                                                                                           |
| **R2 — Segurança**   | ✅     | Boas práticas: no-store cache control em /api/*, CSRF double-submit (cookie HMAC + header, timingSafeEqual), X-Forwarded-For fail-closed (TRUST_PROXY + CIDR), PII audit log (sem name), error handler normaliza (500 → internal_error sem stack trace), rate limit sliding window, lockout dual-tier |

---

## Achados

### P08-A01 — CRÍTICO: Middleware `auth.ts` não seta `event.context.auth` (quebra order/restaurant/print)

- **Tipo**: Bug (quebra total)
- **Severidade**: **Crítica**
- **Confiança**: Alta
- **Arquivo**: `server/middleware/auth.ts:150-153`, handlers em `server/api/orders/`, `server/api/restaurant/`, `server/api/print/`
- **Evidência**: Middleware seta `event.context.user`, `event.context.session`, `event.context.tenantId`, `event.context.userId` (linhas 150-153). **Não seta `event.context.auth`**. Handlers de order/restaurant/print fazem `const auth = event.context.auth` → `undefined` → 401. Handlers de auth (companies, invites) usam corretamente `event.context.user`/`session`.
- **Impacto**: **Todos endpoints order, restaurant, print retornam 401** — funcionalidade totalmente quebrada.
- **Correção**: Adicionar no middleware `auth.ts` linha 153:
  ```ts
  event.context.auth = { user: session.user, session: session.session }
  ```
  Ou mudar todos handlers para usar `event.context.user`/`session` (padrão dos auth handlers).

### P08-A02 — `background` fire-and-forget perde auditoria em serverless/edge

- **Tipo**: Bug (operacional)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/utils/shared/background.ts:11-41`, `server/middleware/auth.ts:59-72`, `server/api/auth/login.post.ts:133-142`
- **Evidência**: `background` usa `event.waitUntil` se disponível (workers/edge) senão `void guarded` (detached promise). Comentário: "safe on long-lived Node processes only". Em serverless (Vercel, Cloudflare, AWS Lambda), processo morre após response → promise órfã não executa → **auditoria perdida** (login, session_validated, session_invalidated, invite_created, etc.).
- **Impacto**: Logs de auditoria incompletos em deploy serverless. Viola compliance (LGPD Art. 37).
- **Correção**:
  1. Documentar que `background` só garante execução em Node long-lived (Docker, VM)
  2. Para serverless, usar `event.waitUntil` (Nuxt/Nitro suporta) ou mover auditoria para queue persistente (`auth_event` table + worker dedicado)
  3. Adicionar teste de integração que verifica persistência de `auth_event` após response

### P08-A03 — `validate-env.ts` não valida `CSRF_SECRET` length (mínimo 32 chars)

- **Tipo**: Segurança
- **Severidade**: Baixa
- **Confiança**: Média
- **Arquivo**: `server/plugins/validate-env.ts` (não lido, inferido do spec), `server/plugins/validate-env.spec.ts` (testa só `BETTER_AUTH_SECRET` length)
- **Evidência**: `.env.example:33` diz `CSRF_SECRET` >= 32 chars. `docker-compose.prod.yml:26` exige a var. `validate-env.spec.ts` testa `BETTER_AUTH_SECRET` length (linhas 30-46) mas **não testa `CSRF_SECRET`**. `getCsrfSecret()` em `csrf.ts:8-16` lança erro em produção se não definido, mas não valida length.
- **Impacto**: CSRF secret fraco (< 32 chars) facilita brute-force se attacker controlar subdomain.
- **Correção**: Adicionar check `CSRF_SECRET.length >= 32` em `missingProductionEnv` + teste em `validate-env.spec.ts`.

### P08-A04 — CSRF double-submit bem implementado (HMAC-SHA256 + timingSafeEqual)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/shared/csrf.ts:22-31,54-62`, `server/middleware/01-csrf-token.ts`, `server/middleware/02-csrf-validate.ts`
- **Evidência**:
  - Token: 32 bytes base64url (256 bits entropy)
  - Cookie: `merp-csrf_token` = `token.HMAC_SHA256(token, CSRF_SECRET)` — assinado, httpOnly, Secure, SameSite=Lax, 7d maxAge
  - Header: `x-csrf-token` (double-submit pattern)
  - Validação: `timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))` — timing attack resistant
  - Exempt paths: register, login, verify-email, reset-password, forget-password, send-verification-email, health, reset-password/ prefix
- **Nota**: Exempt paths corretos — rotas públicas sem sessão não precisam CSRF (rate limit por IP/email é defesa).

### P08-A05 — X-Forwarded-For fail-closed (TRUST_PROXY + CIDR validation)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/shared/ip.ts:4-43`, `server/plugins/validate-env.spec.ts:48-69`
- **Evidência**:
  - `TRUST_PROXY=true` só habilita X-Forwarded-For se `TRUSTED_PROXY_CIDRS` definido (fail-closed)
  - `parseTrustedProxyCidrs` valida CIDR notation, rejeita malformado
  - `BlockList` do `node:net` para subnet matching eficiente
  - `normalizePeer` handle IPv4-mapped IPv6 (`::ffff:10.0.0.5` → `10.0.0.5`)
  - `getClientIp` retorna `undefined` se erro (fail-closed: rate limit/auditoria sem IP, não 500)
  - Prod compose pinado `merp_network: 172.28.0.0/16` + `TRUSTED_PROXY_CIDRS=172.28.0.0/16`
- **Nota**: Previne IP spoofing de auditoria e rate limit por IP (AUD-02).

### P08-A06 — Error handler normaliza: 500 → `internal_error` sem stack trace

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/error-handler.ts:11-43,45-61`
- **Evidência**: `normalizeError`:
  - Erros com status < 500 + message JSON válido (`{error, message}`) → repassa intacto
  - Qualquer outro (500, não-JSON, inesperado) → `{ status: 500, body: { error: 'internal_error', message: 'Internal server error' } }`
  - Log de erro 500+ inclui stack trace **apenas no server log** (não no response)
  - Response header `content-type: application/json` forçado
- **Nota**: FR-027 implementado — nenhum stack trace vazado para cliente.

### P08-A07 — PII audit log: loga `userId` + `email` mas **não `name`** (AUD-14)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/middleware/pii-audit.ts:13-27`
- **Evidência**: Endpoints `/api/auth/me` e `/api/auth/export` logam `pii_access` com `userId`, `email`, `path`, `purpose`. Comentário: "sem `name` no log — email+userId bastam para accountability; nome é PII desnecessária em logs".
- **Nota**: Boa prática — minimização de PII em logs (Docker json-file retention ilimitada).

### P08-A08 — `no-store` cache control em todas rotas `/api/*` (middleware 00-)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/middleware/00-no-store.ts:3-14`
- **Evidência**: Prefixo `00-` garante execução antes do `auth.ts` (ordem alfabética Nitro). Aplica `Cache-Control: no-store, no-cache, must-revalidate` em todo `/api/*` — previne cache de PII em proxies/CDNs/back-forward cache.

### P08-A09 — `purge.ts` (security state cleanup) não revisado

- **Tipo**: Não verificado
- **Severidade**: —
- **Confiança**: Baixa
- **Arquivo**: `server/utils/shared/purge.ts`
- **Evidência**: Não li o arquivo. Provavelmente job de limpeza de `auth_security_state` expirados (lockedUntil passado, resetAt passado).
- **Ação**: Revisar na próxima fase ou assumir OK se testes passam.

---

## Pontos Fortes

- **Defesa em profundidade**: no-store (00) → csrf-token (01) → csrf-validate (02) → auth (middleware order alfabético)
- **CSRF robusto**: HMAC-SHA256 signed cookie + double-submit header + timingSafeEqual + exempt paths corretos
- **IP spoofing prevention**: TRUST_PROXY fail-closed + CIDR validation + BlockList subnet matching
- **Error handling seguro**: 500 sempre → internal_error sem detalhes; contratos < 500 preservados
- **PII minimization**: Audit log sem `name`, email+userId apenas
- **Rate limit + lockout**: Sliding window (IP 20/min, email 5/min, user 60/min) + dual-tier lockout (par 10 + global 50) + FOR UPDATE transacional

---

## Sinais para Roadmap

- **P0 (bloqueador)**: Fix `event.context.auth` no middleware (P08-A01) — **quebra 3 módulos inteiros**
- **P1**: Auditoria persistente para serverless (queue + worker ou `event.waitUntil` garantido)
- **P1**: `validate-env` validar `CSRF_SECRET` length
- **P2**: `purge.ts` review + testes
- **P2**: CSP (Content-Security-Policy) header — não configurado (P01-A05)

---

## Não Verificado / Dúvidas

- `server/utils/shared/purge.ts` — não lido
- `server/plugins/validate-env.ts` — não lido (só spec)
- Integração `background` com `event.waitUntil` no Nitro (funciona em serverless?)
- `hibp.ts` rate limiting na API HIBP (3s timeout, fail-open)
