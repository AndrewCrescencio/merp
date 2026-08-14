# Pendências — Fluxo de Autenticação

## Criticas

### 1. Bloquear login de usuário desativado ✅ RESOLVIDO

**Arquivo:** `server/utils/auth/repository.ts` — método `signIn`

`deactivateUser()` define `isActive=false` e remove sessões, mas `signIn()` não verifica
`isActive` antes de chamar o Better Auth. Um usuário desativado consegue logar novamente.

**Solução:** Antes de chamar `auth.api.signInEmail()`, buscar o usuário por email e
verificar `isActive`. Se false, retornar 401 com código `account_deactivated`.

**Status (2026-08-02):** Implementado — `signIn` verifica `isActive` via `findByEmail`
e lança 401 `account_deactivated` (mensagem "User has been deactivated", alinhada ao
contrato `auth-api.md` — o rascunho da pendência usava "Conta desativada." em PT).
Teste de integração em `repository.test.ts`.

---

### 2. Error codes no login (`account_locked` / `account_deactivated`) ✅ RESOLVIDO

**Arquivo:** `server/api/auth/login.post.ts`

O contrato da API especifica 401 com códigos `account_locked` e `account_deactivated`,
mas o handler de login retorna apenas `unauthorized` genérico.

**Solução:** Mapear os erros do repositório para os códigos corretos no endpoint de login.
O `checkAccountLockout` deve lançar `account_locked` em vez de `unauthorized`.

**Status (2026-08-02):** Implementado — `checkAccountLockout` lança `account_locked`;
o catch do login repassa `account_locked`/`account_deactivated` intactos e registra
`metadata.reason` com o código; 401 sem código continua `unauthorized` genérico.

---

### 3. Ownership check no soft delete de company ✅ RESOLVIDO

**Arquivo:** `server/api/auth/companies.delete.post.ts`

A spec (FR-019) diz "Only company owners and super_admin can delete", mas a implementação
atual só verifica `isCompanyMember()`, ignorando o `role`. Qualquer member pode deletar.

**Solução:** Verificar se `role === 'owner'` antes de permitir a deleção.

**Status (2026-08-02, prompt 11):** Implementado — `companies.delete.post.ts`
exige owner via `assertCompanyRole` + `getCompanyMembershipRole`; backstop RLS
na migration `0009` (UPDATE/DELETE de `company` e DELETE de `company_member`
exigem `is_company_owner` avaliado na execução — TOCTOU).

---

### 4. Tabela/API de Invites ✅ RESOLVIDO

**Spec:** Data model define entidade `Invite` com campos (id, company_id, email, invited_by,
accepted_at, expires_at, created_at) e unique constraint em (company_id, email).

**Status (2026-08-01):** Implementado — tabela `invite` + RLS em
`drizzle/0006_invites_rls.sql`, repositório (`createInvite`, `findPendingInvite`,
`listCompanyInvites`, `acceptInvite`) e endpoints (`POST /api/auth/invite`,
`GET /api/auth/invites`, `POST /api/auth/invites/accept`). O self-join aberto
(`companies.join.post.ts`) foi **removido** — entrar em empresa agora é só via
convite (email da sessão, owner cria convite, expira em 7 dias, INSERT restrito a
owner via `is_company_owner`).

---

## Melhorias

### 5. Endpoint de update de company ✅ RESOLVIDO

#### Estado original (quando a pendência foi aberta)

- **Arquivo:** `server/api/auth/companies/` — **não existia** nenhum endpoint para
  atualizar uma company.
- **Problema:** Não havia forma de alterar `name`, `cnpj` ou `razaoSocial` de uma
  company via API. A criação (`POST /api/auth/companies`) e a exclusão
  (`companies.delete.post.ts`, FR-019) existiam, mas não a atualização — um CRUD
  incompleto: dados cadastrais errados (CNPJ, razão social) ficavam presos para SEMPRE.
- **Solução proposta:** Criar `server/api/auth/companies/[id].put.ts` (ou
  `companies.update.post.ts`).

#### Estado atual (resolvido 2026-08-04, commit `c200c4c`)

**Endpoint:** `POST /api/auth/companies/update` → `server/api/auth/companies.update.post.ts`

Contrato e fluxo do handler:

| Etapa               | Comportamento                                                                                                                                                       | Código                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Auth                | `event.context.user` obrigatório                                                                                                                                    | 401 `unauthorized` 'Authentication required.'                                                                    |
| Body                | `{ companyId, name?, cnpj?, razaoSocial? }` — `companyId` obrigatório (string)                                                                                      | 400 `validation_error` 'companyId is required'                                                                   |
| Validação de campos | `name` deve ser string não-vazia (trim); `cnpj`/`razaoSocial` strings opcionais (trim, `''` → `undefined`); pelo menos 1 campo presente                             | 400 `validation_error`                                                                                           |
| Company existe?     | `findCompanyById` antes do update                                                                                                                                   | 404 `not_found` 'Company not found'                                                                              |
| Permissão           | `getCompanyMembershipRole` → `assertCompanyRole(role, 'owner', ...)` — **apenas owner**                                                                             | 403 não-membro 'You are not a member of this company' / 403 não-owner 'Only company owners can update companies' |
| Sucesso             | Chama `updateCompany(companyId, user.id, input)` e registra `auth_event` `company_updated` com metadata `{ companyId }` (IP via `getRequestIP` com `xForwardedFor`) | retorna a company atualizada como JSON                                                                           |

**Repositório:** `updateCompany(companyId, userId, input)` — `server/utils/auth/repository.ts:816`

- Assinatura no `IAuthRepository`: `updateCompany(companyId: string, userId: string, input: Partial<CreateCompanyInput>): Promise<CompanyResult>`.
- Usa `withTenant(companyId, userId, ...)` → `company_modify_policy` (migration `0009`)
  limita o UPDATE via `is_company_owner(id)` (avaliado na execução com `get_user_id()`),
  servindo como **backstop RLS anti-TOCTOU**: mesmo que o handler falhe a checagem
  de role, um member nunca atualiza (0 rows → 404).
- Aplica apenas os campos fornecidos (`name`, `cnpj`, `razaoSocial`; `cnpj`/`razaoSocial`
  com `|| null` para limpar), sempre faz `updatedAt: new Date()`, filtra
  `isDeleted = false`.
- Erros: `23505` (CNPJ duplicado) → 409 `conflict` 'CNPJ already registered'; 0 rows →
  404 `not_found`; demais DB errors via `handleDatabaseError`.
- **Desvio vs prompt 20** (documentado em `prompts/20-endpoint-update-company.md`):
  `withTenant(companyId, null, ...)` retornaria sempre 404, porque
  `company_modify_policy`/`is_company_owner` dependem de `get_user_id()` — com user
  NULL o UPDATE seria negado para todos. A assinatura passou a exigir `userId`.

**Observabilidade:** evento `company_updated` já previsto no enum de `event_type` do
data model (`specs/001-auth-context/data-model.md:71`), agora efetivamente emitido.

**Testes — todos passando:**

- `server/api/auth/companies.update.post.spec.ts` — 7 casos unit: 401 sem auth; 400
  sem `companyId`; 400 sem nenhum campo; 404 company inexistente; 403 não-membro;
  403 member (não-owner); sucesso com trim de campos + verificação do
  `createAuthEvent` (`company_updated` com `{ companyId }`).
- `server/utils/auth/repository.test.ts` — 4 casos de integração (DB real + RLS):
  update de `name`/`cnpj`/`razaoSocial` com bump de `updatedAt`; CNPJ duplicado → 409;
  company inexistente → 404; **backstop TOCTOU** — member tenta update → 404 e nome
  permanece intacto.

**Verificação manual (2026-08-04):** `pnpm vitest run
server/api/auth/companies.update.post.spec.ts` → 7/7 pass; `pnpm vitest run
server/utils/auth/repository.test.ts -t updateCompany` → 4/4 pass.

---

### 6. Endpoint de remover/leave member ✅ RESOLVIDO

Não há endpoint para remover um usuário de uma company ou para um member sair.

**Solução:** Criar `server/api/auth/companies/members.delete.post.ts`.

**Status (2026-08-02, prompt 21):** Implementado — `POST /api/auth/companies/members/delete`
com `{ companyId, userId? }`: sem `userId` o próprio member sai (403 se não for membro;
owner não pode sair — deve transferir/deletar a empresa); com `userId` apenas owner
remove (403 não-owner, 403 removendo owner, 404 membro inexistente). RLS: nova
policy `cm_delete_policy` (migration `0010`) permite self-delete de linha não-owner
(backstop TOCTOU mantido para o resto). Sessões do removido perdem `activeCompanyId`.
`auth_event` `member_removed` com `{ companyId, removedUserId }`.

---

### 7. Eventos de observabilidade do ciclo de vida da sessão ✅ RESOLVIDO

**Spec FR-023:** Emitir eventos `session_created`, `session_validated`,
`session_expired`, `session_invalidated` com session_id, user_id, tenant_id.

Atualmente só `session_expired` é logado (no middleware). Os demais não são emitidos.

**Status (2026-08-02, prompt 22):** Implementado — `session_created` em
`signIn` (fire-and-forget; `signInEmail` retorna só o token, então o sessionId é
resolvido via `validateSession` em background); `session_validated` no middleware
(fire-and-forget para não adicionar latência a cada request); `session_expired`
no middleware com `email: 'unknown'` (cookie expirado não permite resolver o
usuário; coluna NOT NULL documentada no código); `session_invalidated` em
`logout.post.ts` e `deactivate.post.ts`. Lista de `event_type` do data model
estendida.

---

### 8. Remover `withTenant` duplicado em `helpers.ts` ✅ RESOLVIDO

**Arquivo:** `server/utils/auth/helpers.ts` — linhas 153-165

Existe uma segunda implementação de `withTenant` que cria uma nova conexão postgres.
Não é usada em lugar nenhum — o repositório importa de `./tenant-context.ts`.

**Solução:** Remover o bloco duplicado.

**Status:** Removido o bloco duplicado e os imports não usados (`postgres`, `drizzle`,
`schema`). Aviso de import duplicado do build eliminado.

---

### 9. Rate limiter e lockout em memória ✅ RESOLVIDO

`checkRateLimit` e `checkAccountLockout`/`recordFailedAttempt` usam `Map` em memória.
Não persistem restart do servidor e não funcionam com múltiplos workers/instâncias.

**Solução:** Migrar para Redis ou banco de dados.

**Status (2026-08-02, prompt 24):** Implementado — tabela `auth_security_state`
(`rate:<email>` / `lockout:<email>`) com upsert via `onConflictDoUpdate` em
transação `FOR UPDATE`; lógica pura extraída em `evaluateRateLimit` (janela 60s,
máx. 5 por email — FR-010) e `evaluateLockout` (10 falhas → 30min); funções
`checkRateLimit`/`checkAccountLockout`/`recordFailedAttempt`/`resetFailedAttempts`
agora assíncronas e `await`-adas em `login.post.ts` e `register.post.ts`;
`setInterval` de limpeza removido. Migration `0010_next_morbius.sql`.

---

### 10. Páginas de UI — **ADIADO**

`app/app.vue` renderiza apenas `<NuxtWelcome />`. Não há páginas de login, registro,
dashboard, gerenciamento de companies, etc.

> **Adiado:** sem trabalho de frontend no momento. Backend/API apenas.

---

### 11. Timeout enforcement (FR-024) ✅ RESOLVIDO

Timeout de 5s para chamadas Better Auth e 10s para OAuth não implementado.
Nenhum wrapping de timeout nos métodos do repositório.

**Status (2026-08-02, prompt 25):** Implementado — helper genérico
`withTimeout(promise, ms)` em `server/utils/auth/helpers.ts` (`Promise.race` com
timer limpo em qualquer desfecho; rejeita com `TimeoutError`). `register`
(`signUpEmail`) e `signIn` (`signInEmail`) do repositório envolvidos com
`withTimeout(..., 5_000)`; timeout → 503 `upstream_timeout` via
`handleUpstreamTimeout()`. Comentário no repositório indica que chamadas OAuth
futuras devem usar `withTimeout(..., 10_000)` (nenhum provider OAuth
configurado ainda).

---

### 12. Consent withdrawal flow (FR-021) ✅ RESOLVIDO

O campo `consentWithdrawnAt` existe na tabela `user`, mas não há endpoint para
retirar consentimento, nem lógica de desativação/fila de deleção.

**Status (2026-08-02, prompt 26):** Implementado — `withdrawConsent(userId)` no
repositório (`IAuthRepository`), transação via `withTenant(null, userId, ...)`
que seta `consentWithdrawnAt = now()`, `isActive = false` e deleta todas as
sessões; endpoint `POST /api/auth/consent/withdraw` (auth obrigatório) registra
`auth_event` `consent_withdrawal` com metadata `{ consentWithdrawnAt }` e
retorna `{ message: 'Consent withdrawn successfully' }`. A fila de
deleção/anonymização fica fora do escopo (escopo do prompt). `UserResult` ganhou
o campo `consentWithdrawnAt`. Testes: spec do endpoint (401/sucesso/evento) e
casos de integração (desativação + fim de sessões + signIn rejeitado com
`account_deactivated`).

---

### 13. Error handler global (FR-026) ✅ RESOLVIDO

Não há plugin/error handler global do Nitro para capturar erros 500 inesperados
e retornar o formato padrão `internal_error`. Erros podem vazar detalhes internos.

**Status (2026-08-02, prompt 27):** Implementado — `server/error-handler.ts`
com `defineNitroErrorHandler` (`nitropack/runtime`) + função pura `normalizeError`
(erro do contrato `{ error, message }` em JSON com status < 500 é repassado
intacto; qualquer outro vira 500 `internal_error` sem vazar detalhes; `logger.error`
com message/stack para diagnóstico interno). Registrado em `nuxt.config.ts`
via `nitro.errorHandler`. Desvios: (a) `nitropack` adicionado como devDependency
(import transitivo não resolve no strict node_modules do pnpm); (b) import vem de
`nitropack/runtime` (o export não existe no entry principal); (c) path usado é
`~~/server/error-handler` — no Nuxt 4 `~` aponta para srcDir (`app/`), não raiz.
Verificado em runtime com build de produção + preview (401 do contrato repassado
intacto; 500 genérico → `internal_error` sem vazar mensagem, detalhe só no log).
Em dev o Nitro usa o dev overlay próprio (devErrorHandler), então o formato só é
visível em produção.

---

### 14. Startup failure handling (FR-025) ✅ RESOLVIDO

Se a inicialização do Better Auth em `shared/auth.ts` falhar, os endpoints de auth
devem retornar 503 `auth_unavailable`. Não há graceful degradation nem health check.

**Status (2026-08-02, prompt 28):** Implementado — `shared/auth.ts` com
inicialização lazy + cache de promise (`getAuth()`): o módulo não executa
`betterAuth()` no import; a instância só é criada no primeiro uso. Novo
`isAuthAvailable()` (resolve `getAuth()`, retorna `false` com log de erro se a
inicialização falhar). Consumidores ajustados: `server/utils/auth/repository.ts`
(`register`/`signIn` resolvem via `resolveAuth()` e repassam H3Errors — falha de
resolução → 503 `auth_unavailable` via novo helper `sendAuthUnavailableError()`),
`server/middleware/auth.ts` (falha de resolução → 503 em vez de 401; `/api/health`
adicionado às rotas públicas) e `server/api/auth/logout.post.ts`. Health check:
`GET /api/health` (público, sem auth) responde 200 com
`{ status, auth: ready|unavailable, db: ok|unavailable }` — `auth` via
`isAuthAvailable()`, `db` via `db.execute(sql\`SELECT 1\`)`em try/catch. Testes:
spec`server/api/health.get.spec.ts`(4 casos) + spec do middleware (503`auth_unavailable`, `/api/health`público) e do logout atualizadas para o mock`getAuth`. Verificado em runtime: `GET /api/health`→ 200 com`auth: ready`e`db: ok`(com`DATABASE_URL`alcançável do host). Nota:`server/api/auth/register.post.spec.ts`mantém um mock morto de`#shared/auth` (registro não importa mais o módulo) —
inofensivo.

---

### 15. Cookie de sessão nunca era definido no login (Set-Cookie descartado) ✅ RESOLVIDO

**Arquivo:** `server/utils/auth/identity/repository.ts`, `server/api/auth/login.post.ts`, `server/api/auth/logout.post.ts`, `server/middleware/auth.ts`

CRÍTICO: `auth.api.signInEmail()` grava o cookie de sessão nos **response headers do
retorno** (`setSessionCookie` → `ctx.context.responseHeaders`), mas a chamada sem
`returnHeaders: true` descartava os headers — o cookie `merp-session_token` nunca
chegava ao navegador. Resultado: login "funcionava" (200 + user), mas nenhuma sessão
era estabelecida; todo request autenticado subsequente retornava 401. O mesmo valia
para o `signOut` (cookie de expiração nunca limpo) e para o `getSession` do middleware
(cookie de sessão expirada nunca expirado no cliente). Os testes unitários não pegavam
isso porque mockam o repositório.

**Status (2026-08-09, prompt de revisão de segurança):** Implementado —
`signInEmail`/`signOut`/`getSession` chamados com `returnHeaders: true`; o repositório
retorna `setCookie: string[]` (via `headers.getSetCookie()`) e os handlers reencaminham
com `appendResponseHeaders`. Testes novos: login forwards o Set-Cookie, logout forwards
a expiração, middleware forwards o cookie expirado.

---

### 16. Rate limit fixed-window + lockout contando falhas de infraestrutura ✅ RESOLVIDO

**Arquivos:** `server/utils/shared/security.ts`, `server/utils/schema/security.ts`,
`drizzle/0011_sliding_window_rate_limit.sql`, `server/api/auth/login.post.ts`,
`shared/auth.ts`

Dois desvios de segurança: (a) o rate limit era fixed-window (`count`/`resetAt`), não a
janela deslizante da FR-010 — um atacante podia fazer 5 requisições no fim de uma janela

- 5 no início da próxima (10 em sucessão rápida); (b) o lockout (`recordFailedAttempt`)
  incrementava para **qualquer** erro no login, inclusive 503/500 transitórios e
  `account_deactivated` — uma falha de infraestrutura bloqueava a conta por 30 min.

**Status (2026-08-09, prompt de revisão de segurança):** Implementado — (a) coluna
`window` (jsonb) com timestamps ISO por hit; a contagem só considera hits nos últimos
60s; `Retry-After`/`RateLimit-Reset` refletem quando o hit mais antigo sai da janela.
Migração `0011` (idempotente, reaplicável pelo `apply-custom-sql`). (b) `recordFailedAttempt`
só é chamado para `invalid_credentials`. Juntamente: TTL de sessão corrigido para a FR-010
(rememberMe=7d via `expiresIn`, sem rememberMe=24h nativo do better-auth) com
`disableSessionRefresh: true` — o refresh automático promoveria sessões de 24h para 7d;
e detecção de email duplicado no register via statusCode 422 (antes, sniffing de
`message.includes('already')`).

---

### 17. Member podia UPDATE/DELETE invites da empresa (residual AUD-01) ✅ RESOLVIDO

**Arquivo:** `drizzle/0006_invites_rls.sql` (policies `invite_update_policy`/`invite_delete_policy`)

O residual do AUD-01 (registrado em `docs/security/auth-audit-2026-08.md:31` para revisão
futura): `invite_update_policy` e `invite_delete_policy` usavam apenas
`USING ("company_id" = get_tenant_id())` — qualquer member podia alterar (email,
expiração) ou apagar invites não-aceitos da própria empresa, sem check de role.

**Solução:** `drizzle/0013_invite_owner_update.sql` — UPDATE agora exige **owner** OU o
**claim por token** (mesmo padrão do `cm_insert_policy`): email do invite = email do
usuário da sessão + `token_hash` no GUC + pendente + não expirado (cobre o
`acceptInvite`, que roda com o contexto do convidado, ainda não-member). DELETE é
owner-only (não há endpoint de revogação; quando houver, será restrito a owner).

**Status (2026-08-14):** Implementado — migration `0013` aplicada via `apply-custom-sql`
(idempotente). Teste de integração em `server/utils/auth/invite/repository.test.ts`:
member tenta UPDATE de invite → negado pelo banco (42501) e invite permanece intacto;
o teste de expiração manual passou a rodar como owner (era `null` — negado pela nova
policy, correto).

---

### 18. Prod compose com TRUST_PROXY=true sem TRUSTED_PROXY_CIDRS ✅ RESOLVIDO

**Arquivo:** `docker-compose.prod.yml`

O compose de produção setava `TRUST_PROXY=true` (nginx reescreve o header) mas nunca
definia `TRUSTED_PROXY_CIDRS` — obrigatória quando `TRUST_PROXY=true` (fail-closed do
AUD-05, `server/plugins/validate-env.ts:13`). O boot de produção seria **recusado**
conforme documentado: falha de config de deploy, não de código.

**Solução:** subnet da `merp_network` pinada em `172.28.0.0/16` (ipam no compose de
produção) e `TRUSTED_PROXY_CIDRS=172.28.0.0/16` setado no serviço `app` — o peer
imediato (container nginx) fica deterministicamente dentro do CIDR. `.env.example`
atualizado com a nota de não sobrescrever em `.env` sem mudar a subnet.

**Status (2026-08-14):** Implementado — `docker compose -f docker-compose.yml -f
docker-compose.prod.yml config` valida; boot de produção passa a subir com o CIDR
correto.

---

### 19. Open redirect no link de reset de senha (callbackURL da query) ✅ RESOLVIDO

**Arquivo:** `server/api/auth/reset-password/[token].get.ts`

O handler de clique do link de reset (GET `/api/auth/reset-password/<token>`) aceitava
`callbackURL` da query string sem validação e redirecionava (302) para
`<origin>/?token=...` — um **open redirect** no domínio confiável: qualquer um podia
montar um link `https://app/.../reset-password/<token>?callbackURL=https://evil.com`
(phishing com o domínio legítimo na URL) e, com um token válido na mão, vazar o token
na URL para o atacante. O link do email em si era seguro (o `requestPasswordReset`
envia `redirectTo: baseURL` server-side), mas o handler não podia confiar no input.

**Solução:** allowlist de origens (`BETTER_AUTH_URL` + `CORS_ORIGIN`); `callbackURL`
de origem estranha ou malformado → fallback para a origem padrão do app. Sem mudança
de contrato: o email continua apontando para a origem correta.

**Status (2026-08-14):** Implementado — testes: origem estranha rejeitada (cai para
`BETTER_AUTH_URL`), `CORS_ORIGIN` aceito, caminho arbitrário reduzido à origem
(existente), ausência de callbackURL usa `BETTER_AUTH_URL`.
