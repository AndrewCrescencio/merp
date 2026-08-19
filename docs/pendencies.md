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

**Solução (endurecida 2026-08-14):** o `callbackURL` foi **removido por completo** —
o destino do redirect é derivado só de config de servidor (`BETTER_AUTH_URL`); input
de usuário nunca influencia o destino. O email legítimo é gerado server-side com
`redirectTo: baseURL`, então o parâmetro não servia a nenhum fluxo real — era
superfície de ataque pura (elimina a classe inteira do open redirect, inclusive
futuros bugs de allowlist).

**Status (2026-08-14):** Implementado — testes: token válido → `<app-origin>/?token=`,
token inválido/expirado → `?error=INVALID_TOKEN`, `callbackURL` (qualquer valor)
ignorado, env ausente → fallback `http://localhost:3000`.

---

### 20. Middleware de auth bloqueava os links de email (AUD-09) ✅ RESOLVIDO

**Arquivo:** `server/middleware/auth.ts` (publicRoutes)

O middleware de sessão só liberava `register`/`login`/`health`/`/` — os destinos dos
links dos emails (`GET /api/auth/verify-email`, `GET /api/auth/reset-password/<token>`
e `POST /api/auth/reset-password`) retornavam 401 sem sessão, e o usuário que clica o
link de email **não tem sessão** (autoSignIn=false; reset é só para quem esqueceu a
senha). Deadlock: registro → link de verificação 401 → login 403 `email_not_verified`
com reenvio do mesmo link quebrado; reset de senha impossível. Neutralizava as
mitigações de AUD-03/AUD-04. Os specs unitários não pegavam porque chamavam os
handlers direto, sem passar pelo middleware.

**Solução (2026-08-15):** `publicRoutes` ganhou `/api/auth/verify-email` e
`/api/auth/reset-password`; novo `publicRoutePrefixes` (match por prefixo) cobre o GET
dinâmico `/api/auth/reset-password/<token>` — o `includes` literal não casa o path com
token. Essas rotas se autenticam pelo próprio token (uso único + TTL 1h) + rate limit
por IP, não por sessão. Testes: 2 casos novos em `server/middleware/auth.spec.ts`
(rotas de email passam sem sessão; `getSession` não é chamado). Registro completo em
`docs/security/aud-09-middleware-email-links.md`. Suíte: 298 testes + lint limpo.

---

### 21. Busca global de empresas expunha nome+CNPJ de tudo (AUD-10) ✅ RESOLVIDO

**Arquivo:** `server/utils/auth/company/repository.ts` (`searchCompanies`),
`server/api/auth/companies.get.ts`

`GET /api/auth/companies?q=...` buscava em **todas** as empresas não-deletadas —
qualquer usuário autenticado enumerava nome+CNPJ do banco inteiro, sem vínculo. A
policy `company_select_policy` (0005) liberava `is_deleted = false` sem contexto.

**Decisão (2026-08-15):** escopar por vínculo — a busca só retorna empresas onde o
usuário é member. Consequência assumida: a descoberta de empresas para novos usuários
sem vínculo deixa de existir (self-join já era via convite; onboarding futuro precisa
de outro mecanismo se quiser busca pública).

**Solução:** `searchCompanies(query, userId)` agora faz `innerJoin company_member`
dentro de `withTenant(null, userId, ...)` — o GUC `app.user_id` é necessário porque a
`cm_select_policy` só expõe linhas de `company_member` com `user_id = get_user_id()`
(sem contexto, o join retornaria 0 linhas). Endpoint repassa `user.id`. Testes: caso
de integração novo (member vê só as próprias empresas; outsider não vê as do outro) +
spec do endpoint atualizado (`searchCompanies('Test', 'user-1')`). Suíte: 298 testes

- lint limpo. Nota: a `company_select_policy` segue permissiva no banco (defesa em
  profundidade para SELECT direto) — nenhum endpoint expõe mais a busca global.
- **Nota registrada (decisão pendente de produto):** a busca escopada mata a
  descoberta de empresas para quem ainda não tem vínculo — se onboarding precisar de
  busca pública no futuro, terá que ser decisão separada, ex.: busca pública limitada
  a `id + name` (sem CNPJ, que é dado sensível) numa rota dedicada, com rate limit.

---

### 22. nginx sem CSP / Referrer-Policy (AUD-10) ✅ RESOLVIDO

**Arquivo:** `infra/nginx/nginx.conf`

Faltavam `Content-Security-Policy` e `Referrer-Policy` (HSTS/nosniff/XFO já existiam).

**Solução (2026-08-15):** `Referrer-Policy: no-referrer` — o token de reset aparece em
URL (`?token=...`) e não deve vazar em Referer de navegações externas. CSP conservadora
de origem única (`default-src 'self'`; `script-src 'self'`; `style-src 'self'
'unsafe-inline'` para estilos injetados pelo Vue; `img/font-src 'self' data:`;
`connect-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action
'self'`). Config validada via `nginx -t` (único erro do teste é o upstream `app:3000`
não resolver fora da rede do compose — esperado).

---

### 23. Revisão de segurança 2026-08-15 (AUD-11) ✅ RESOLVIDO

**Arquivos:** `server/utils/auth/company/repository.ts`, `drizzle/0014_bootstrap_role_split.sql`,
`server/plugins/validate-env.ts`, `docker-compose.prod.yml`, `server/api/auth/invite.post.ts`,
`server/api/auth/invites.accept.post.ts`, `server/api/auth/login.post.ts`, `Dockerfile`

Achados da revisão do código inteiro contra a auditoria `docs/security/auth-audit-2026-08.md`
(AUD-01 a AUD-10 verificados resolvidos no código; 298 testes verdes):

1. **Mina de escalada no `createCompanyMember`** — o método se auto-autorizava: setava o
   flag `app.allow_owner_bootstrap` e aceitava qualquer `(companyId, userId, role)`
   incluindo `'owner'`, sem checar o papel do chamador. Nenhum endpoint o usava (só
   fixtures de teste), mas qualquer fluxo futuro de "add member" que o reaproveitasse
   anularia o backstop RLS do AUD-01 por dentro.
   **Fix:** `drizzle/0014_bootstrap_role_split.sql` — flags de bootstrap escopados por role:
   `app.allow_founder_bootstrap` → só `role='owner'` (setado apenas por
   `createCompanyWithOwner`); `app.allow_member_bootstrap` → só `role='member'`
   (`createCompanyMember`); a branch de token de convite também exige `role='member'`.
   Guard no app: `createCompanyMember` rejeita `role !== 'member'` com erro claro.
   Fixtures de teste migraram de `createCompany` + `createCompanyMember(..., 'owner')`
   para `createCompanyWithOwner`. Testes novos: guard do app + backstop DB (raw SQL com
   flag de member + role='owner' → 42501).

2. **`APP_DATABASE_URL` ausente → produção rodava como role OWNER (fail-open)** — `db.ts`
   caía silenciosamente para `DATABASE_URL`; o prod compose defaultava para vazio;
   `validate-env.ts` não checava. RLS FORCE (0007) limitava o estrago, mas a postura
   fail-closed do AUD-05 era violada.
   **Fix:** `missingProductionEnv` exige `APP_DATABASE_URL` em produção (boot recusado);
   `docker-compose.prod.yml` usa `${APP_DATABASE_URL?Variable not set}` (fail no compose).

3. **Sem rate limit em `POST /api/auth/invite` e `POST /api/auth/invites/accept`** — mutações
   baratas sem limite por IP.
   **Fix:** `checkIpRateLimit` no início de ambos (padrão das rotas públicas).

4. **`login.post.ts` — `getClientIp` fora de try/catch no catch de lockout** — sem socket,
   um TypeError mascararia o 401 genérico com 500 espúrio.
   **Fix:** re-resolução do IP dentro de try/catch (auditoria sem IP).

5. **Dockerfile de produção rodava como root.**
   **Fix:** `USER node` no stage `production` (`.output` é somente leitura).

**Status (2026-08-15):** Implementado — migration `0014` aplicada via `apply-custom-sql`
(idempotente); lint limpo; suíte completa verde (298 testes baseline + 2 novos de
integração do item 1).

---

### 24. Revisão de segurança 2026-08-16 (AUD-12) ✅ RESOLVIDO

Revisão do código inteiro após AUD-11 (300 testes verdes). Achados novos:

1. **`POST /api/auth/forget-password` bloqueado pelo middleware** — `publicRoutes`
   (`server/middleware/auth.ts`) liberava `verify-email` e `reset-password` (AUD-09) mas
   esquecia o endpoint que **inicia** a recuperação — quem esqueceu a senha está deslogado
   por definição → 401 "Authentication required." antes do handler. O fluxo de recovery do
   AUD-04 (incl. takeover de pré-registro) ficava morto em produção; os specs não pegavam
   pelo mesmo gap do AUD-09 (chamada direta do handler, sem middleware).
   **Fix:** `'/api/auth/forget-password'` na `publicRoutes` + teste no `auth.spec.ts`.
   Rota continua protegida por `checkIpRateLimit` + `checkEmailRateLimit` (5/min).

2. **nginx aceitava qualquer Host** — sem `default_server` explícito, o único server block
   443 virava default implícito para qualquer Host (o comentário AUD-11 afirmava pinning
   que não existia); `Host` era repassado ao app como veio. Sem exploração hoje (links
   derivam de `BETTER_AUTH_URL`, não do Host), mas qualquer dependência futura do Host
   herdaria o vetor (host-poisoning em links de reset).
   **Fix:** `if ($host != app.merp.com.br) { return 444; }` nos server blocks 80 e 443 —
   Host desconhecido descartado antes de redirect/log/proxy.

3. **`auth_event` sem purge** — `session_validated` é gravado em toda request autenticada
   (`server/middleware/auth.ts:113`) e não havia task de retenção (só `purge-sessions` e
   `purge-security-state`). Crescimento monotônico de PII (email/IP/metadata por request)
   — risco LGPD de retenção.
   **Fix:** `server/tasks/purge-auth-events.ts` (retenção 90 dias, mesmo padrão das tasks
   existentes) + agendada no `nuxt.config.ts`.

**Aceitos como decisão (não corrigidos):**

- **Tabelas de identidade sem RLS** (`user`, `session`, `account`, `verification`,
  `auth_event`, `auth_security_state`) — o backstop RLS cobre apenas as tabelas de tenant
  (`company`, `company_member`, `invite`). Tabelas de identidade são **globais por
  natureza** (o better-auth consulta `user` por email, `session` por token, sem GUC de
  tenant); policy permissiva = no-op, policy restritiva = quebra auth. Não há posição
  intermediária viável — a mitigação é a camada de app (checks de autorização) + role de
  app com privilégios mínimos. Revisitar se algum dia houver escopo por tenant em
  identidade.
- **`company_select_policy` permissiva no banco** — decisão de produto já registrada
  (item 21, nota de 2026-08-15): busca pública futura. Todos os handlers escopam por
  membership na camada de app.
- **`GET /api/auth/invites` acessível a qualquer member** — deliberado e protegido por
  teste de regressão (`invites.get.spec.ts`): convites pendentes são contexto da equipe;
  a RLS espelha o handler. Criar convite segue owner-only.
- **Token de reset em claro no `:80`** — inevitável se o cliente fizer request por http
  (o token vai na linha de request); mitigado por HSTS (`Strict-Transport-Security`,
  max-age 1a) já presente nos server/locations e por `main_no_query` (token nunca logado).

**Status (2026-08-16):** Implementado — lint limpo; suíte completa verde.

---

### 25. Revisão de segurança 2026-08-16 (AUD-13) ✅ RESOLVIDO

Revisão em profundidade das áreas não lidas no AUD-12 (handlers de companies/consent/
export, shared/auth.ts, security.ts, tenant-context.ts, pii-audit, error-handler).
Itens verificados OK: export.get (só dados próprios), tokens de reset/verify (uso único,
TTL 1h), cookies (httpOnly+samesite=lax+secure), CSRF, sliding window sem TOCTOU
(`FOR UPDATE`), GUCs transaction-local, mass assignment limitado no register.

Corrigido:

1. **TOCTOU no switch de empresa (médio-alto, latente)** — `companies.switch.post.ts`
   checava `isCompanyMember` e depois `setActiveCompany` em transações separadas: um
   owner podia remover o membro na janela entre as duas, deixando
   `session.activeCompanyId` apontando para empresa onde o usuário não é mais membro —
   o GUC de tenant satisfaz as policies RLS sozinho (`get_tenant_id()`), então qualquer
   endpoint futuro que confie no contexto vazaria para ex-membros.
   **Fix:** `setActiveCompany(sessionId, companyId, userId)` revalida a filiação **na
   mesma transação** do update (`EXISTS` em company_member com o GUC de user setado;
   falha → 403). `softDeleteCompany` também limpa `activeCompanyId` das sessões da
   empresa deletada (gap análogo já coberto em `removeCompanyMember`).

2. **Registro sem consentimento gravado (médio)** — `consentTermsVersion` era opcional
   (`required: false` no better-auth, `if (input.consentTermsVersion)` no repositório):
   conta ativa criada com `consent_terms_version` NULL se o cliente omitisse o campo, e
   a versão alegada vinha do cliente sem validação — base legal do registro (LGPD)
   forjável.
   **Fix:** `register.post.ts` exige `consentTermsVersion` não-vazio (400) e normaliza
   com trim antes de repassar. Teste novo no spec.

3. **Login: 503 com sessão válida criada (baixo)** — o `Set-Cookie` de sessão era
   anexado ANTES do `await createAuthEvent`; falha de auditoria (DB down) virava 503
   com sessão válida no cliente → retries acumulam sessões órfãs.
   **Fix:** auditoria do caminho de sucesso passou para fire-and-forget (padrão FR-023,
   `void ... .catch(logger.warn)`) — auditoria nunca mais bloqueia nem falha o login.

**Aceitos como decisão (documentados, não corrigidos):**

- **Ações destrutivas sem reautenticação** (`deactivate.post`, `consent/withdraw.post`)
  — ASVS recomenda re-autenticação; sem frontend no repo, é decisão de produto.
  Mitigado por SameSite=Lax (CSRF) e cookie httpOnly.
- **Spam vector de email** — `send-verification-email`/`forget-password`/notice de
  desativação disparam emails reais a 5/min por email (300/h com rotação de IP; o
  better-auth não tem cooldown, só floor de timing). Resíduo conhecido do AUD-04/06;
  mitigação real exige infra de fila/cooldown de envio.
- **Oráculos de enumeração 404/403** — `findCompanyById` → 404 antes do check de role
  → 403 (existência de empresa por UUID); `members.delete` → 404/403 (filiação);
  mensagens distintas member/owner. Baixo: requer autenticação e UUIDs.
- **Token de reset na query do redirect** (`/api/auth/reset-password/<token>` → `/?token=`)
  — padrão comum; mitigado por `no-referrer`, logs sem query (AUD-10) e HSTS.

**Nota operacional (ambiente):** a senha da role `merp_app` foi sobrescrita duas vezes
em 2026-08-16 por recriações do container postgres (a conexão dos testes vem do host
via bridge do Docker → cai na regra scram do pg_hba, **não** no trust de loopback —
o trust só vale para conexões de dentro do container). Se os testes integração falharem
com `28P01 password authentication failed for user "merp_app"`, reaplicar:
`docker exec merp-postgres-1 psql -U merp -d postgres -c "ALTER ROLE merp_app WITH LOGIN PASSWORD 'merp_app'"`.

**Status (2026-08-16):** Implementado — lint limpo; suíte completa verde (302 testes).

---

### 18. Certificado TLS de produção (Let's Encrypt) — NÃO IMPLEMENTADO ⏳ PENDENTE DE INFRA

**Status (2026-08-16):** A infra de emissão foi montada (nginx webroot + serviço `certbot` no compose prod), mas a emissão real está **bloqueada por dependências externas** verificadas nesta data:

| Dependência                                      | Estado verificado                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Registro A `app.merp.com.br` → IP público        | **Não existe** (DNS público não resolve; testado contra 1.1.1.1)         |
| Port-forward 80/443 no roteador → `192.168.5.56` | **Não configurado** (timeout em `170.244.29.54:80/443`)                  |
| IP público fixo                                  | **Dinâmico** (host em DHCP — `wlo1 dynamic`); considerar IP fixo ou DDNS |

**Já implementado (validado com `nginx -t` e teste real):**

- `nginx.conf` — `location /.well-known/acme-challenge/` no server 80 com `root /var/www/certbot` (webroot); o redirect https ficou em `location /` porque **`return` no nível server vence locations** (fase rewrite roda antes do content handler — padrão canônico do certbot). Desafio testado: 200.
- `docker-compose.prod.yml` — serviço `certbot` (certbot/certbot) + volume `webroot` compartilhado (ro no nginx); volume `certs` é o mesmo do nginx.
- `.env.example` — `DOMAIN` e `CERTBOT_EMAIL`.

**Passos restantes (executar no servidor de produção, nesta ordem):**

1. Criar registro A: `app.merp.com.br` → IP público do servidor (e port-forward 80/443 → máquina).
2. Bootstrap (nginx não sobe sem cert): cert dummy no volume `certs` (openssl + copiar para `live/merp/` com `fullchain.pem`, `privkey.pem`, `chain.pem`), depois `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.
3. Emissão real:
   `docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} -m ${CERTBOT_EMAIL} --agree-tos --no-eff-email`
4. `docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload`
5. Cron do host (renovação — 90 dias):
   `15 3 * * * docker compose -f /caminho/docker-compose.yml -f /caminho/docker-compose.prod.yml run --rm certbot renew && docker compose -f /caminho/docker-compose.yml -f /caminho/docker-compose.prod.yml exec nginx nginx -s reload`
   (o reload é **obrigatório**: o nginx só lê o cert novo em start/reload; o desafio webroot não precisa.)

**Bugs corrigidos no caminho (verificação 2026-08-16):**

- `return 301` no nível server do bloco 80 **engolia o location ACME** (retornava 301 para o desafio) — corrigido movendo o redirect para `location /`.
- Renovação sem reload documentada anteriormente — corrigido no comentário do compose.

---

### 26. Revisão de segurança 2026-08-16 (AUD-14) ✅ RESOLVIDO

Revisão do código inteiro após AUD-13 (302 testes verdes), focada em consistência
dos padrões já estabelecidos (FR-023, AUD-11) e em superfícies não cobertas pelos
itens anteriores. Achados novos:

1. **FR-023 violado fora do login (médio)** — o `createAuthEvent` lançava
   (`handleDatabaseError`) e handlers **aguardavam** a auditoria depois da mutação
   cometida: register, logout, deactivate, consent/withdraw, companies
   update/delete, members delete, invite create/accept devolviam 503 com o efeito
   já persistido (retry → 409/404 confusos, sessões órfãs). No login, a auditoria
   de `failed_login` awaited podia mascarar o 401 com 503 e **pular** o
   `recordFailedAttempt` (brute-force seguiria sem contagem).
   **Fix raiz:** `createAuthEvent` passou a **nunca lançar** — falha de insert vira
   `logger.warn` e resolve; os `.catch()` existentes (middleware, repositórios)
   seguem válidos como no-op. Garantia coberta por spec novo
   (`server/utils/shared/audit.spec.ts`: falha → resolve + warn).

2. **Inputs sem teto de tamanho (médio, DoS leve + PII bloat)** — emails gigantes
   viram chaves `rate:`/`lockout:` no `auth_security_state` (PK text; índice btree
   quebra em ~2704 bytes → 54000 → 503) e `name`/`consentTermsVersion` viram
   colunas de PII desproporcionais; senha de megabytes custa scrypt desmedido no
   register/login/reset (o better-auth hasheia antes de validar).
   **Fix:** constantes em `server/utils/shared/security.ts` (RFC 5321/OWASP):
   `MAX_EMAIL_LENGTH=254`, `MAX_PASSWORD_LENGTH=128`, `MAX_NAME_LENGTH=120`,
   `MAX_CONSENT_VERSION_LENGTH=50`, `MAX_SEARCH_QUERY_LENGTH=100`; checks em
   login, register, forget-password, send-verification-email, invite,
   reset-password e companies.get. No login o excesso responde 401 genérico
   **idêntico** a credenciais inválidas (nenhuma conta legítima passa dos tetos —
   zero oráculo, timing uniforme) e roda **antes** do `checkEmailRateLimit` (email
   gigante nunca vira chave). Specs novos em cada handler.

3. **Login de sucesso derrubado por falha de `resetFailedAttempts` (baixo-médio)**
   — sessão criada pelo better-auth, `Set-Cookie` nunca anexado (append vinha
   depois), resposta 503, auditoria `failed_login` reason `'unknown'` enganosa e
   sessão órfã. **Fix:** try/catch → `logger.warn` → entrega o login; contadores
   stale expiram (30min lockout / 24h purge). Spec novo no login.

4. **`pii-audit` logava `name` (baixo)** — PII desnecessária em logs json-file do
   Docker; `email`+`userId` bastam para accountability. **Fix:** `name` removido do
   log; specs atualizados.

5. **`POST /api/auth/companies` sem rate limit por IP (baixo)** — mesma classe do
   AUD-11 (mutação barata de abusar: INSERT por request, sem teto por sessão).
   **Fix:** `checkIpRateLimit` antes do `readBody` (padrão invite.post). Specs novos.

6. **Error handler sem `Content-Type: application/json` (baixo)** — corpo de erro é
   sempre JSON do contrato (FR-026) mas sem o header; clientes/proxies podiam
   tratar como texto (sniffing). **Fix:** header setado em toda resposta de erro.
   Spec novo.

7. **`getClientIp` podia lançar sem node (baixo, consistência)** — o
   `getRequestIP` do h3 não usa optional chaining (`event.node.req.socket`):
   evento sem node (testes/web) → TypeError → 500 espúrio; o login já tratava com
   try/catch, os demais 9 call sites não. **Fix raiz:** `getClientIp` fail-closed
   (try/catch interno → `undefined`; rate limit/auditoria ficam sem IP, nunca 500).
   Spec novo.

**Verificados OK (sem ação):** validação/rate limit das rotas de recovery,
middleware e nginx (AUD-09/12), RLS e grants (AUD-01/05/11, `0015`), todos os
demais achados AUD-01 a AUD-13 (releitura de código completa).

**Status (2026-08-16):** Implementado — lint limpo; suíte completa verde (320
testes, +18 vs. baseline: 13 specs de handlers + audit + ip + error-handler +
pii-audit).

---

## Auditoria de segurança 2026-08-18 (AUD-15 a AUD-25) ✅ REVISÃO CONCLUÍDA

Revisão integral do repositório — relatório completo em
`docs/security/security-audit-2026-08-18.md`. Correções aplicadas em
2026-08-18 pelos prompts `33`, `34` e `35` (executados em ordem, `pnpm test` +
`pnpm lint` verdes em cada um). Pendências restantes: AUD-18 (risco aceito),
AUD-19 (operacional) e AUD-20 (defesa em profundidade).

### 27. Rate limit do nginx 5 req/min por IP (AUD-15) ✅ RESOLVIDO

**Arquivo:** `infra/nginx/nginx.conf`

Bucket compartilhado entre todos os endpoints `/api/auth/` — qualquer usuário
atrás do mesmo IP (NAT) ou um atacante exaure o bucket de todos; fluxo legítimo
de login estoura a janela. A app já limita fino (20/min IP, 5/min email).

**Correção (prompt 33):** `rate=20r/m`, `burst=10 nodelay` — o nginx vira
camada grossa anti-anomalia (por IP); a fina (sliding window) vive na app;
20r/m alinhado ao `MAX_REQUESTS_PER_IP`. Comentários atualizados.

**Status (2026-08-18):** Implementado — `docker compose config` valida;
`nginx -t` limpo. Detalhes no relatório (AUD-15).

---

### 28. Sem rate limit por usuário em rotas autenticadas (AUD-16) ✅ RESOLVIDO

**Arquivo:** `server/middleware/auth.ts`, `server/utils/shared/security.ts`

Todo request protegido grava `session_validated` em `auth_event` e endpoints
como `/api/auth/export` não têm teto por usuário — contas baratas + IPs
rotativos saturam o pool do banco e enchem a auditoria de lixo.

**Correção (prompt 33):** `checkUserRateLimit` (chave `rate:user:${userId}`,
60/min) no middleware antes do `emitSessionEvent` — 429 não gera
`session_validated` nem avança o contexto.

**Status (2026-08-18):** Implementado — unit (janela/limite), integração
(chave no DB, janela desliza) e middleware (429 sem evento). Detalhes no
relatório (AUD-16).

---

### 29. GET com PII sem `Cache-Control: no-store` (AUD-17) ✅ RESOLVIDO

**Arquivos:** `server/api/auth/me.get.ts`, `export.get.ts`, `invites.get.ts`

Email, nome, CNPJ e sessões em GET sem no-store (app nem nginx) — cache de
navegador/proxy em máquina compartilhada.

**Correção (prompt 34):** middleware `no-store.ts` para toda rota `/api/**`
(`no-store, no-cache, must-revalidate`) — um ponto cobre me/export/invites +
futuras.

**Status (2026-08-18):** Implementado — spec do middleware (recebe em
`/api/`, não recebe na raiz, mantém em throw). Detalhes no relatório (AUD-17).

---

### 30. Token de reset de senha em claro no banco (AUD-18) ⏳ PENDENTE (risco aceito)

**Arquivo:** `server/utils/auth/identity/repository.ts` (`verification`)

O fluxo de reset do better-auth guarda o token cru no `identifier` da tabela
`verification` — dump do banco permite account takeover. Design do better-auth;
reavaliar se o fluxo for customizado. Mitigação: o dump já expõe senhas scrypt
e tokens de sessão (risco é a classe "banco comprometido").

**Status (2026-08-18):** Pendente — risco aceito documentado no relatório
(AUD-18); migração de grants (AUD-19) reduz a superfície de leitura.

---

### 31. Role `merp_app` e grants core fora de migração (AUD-19) ⏳ PENDENTE

**Arquivos:** `drizzle/0015_app_role_grants.sql`, `docker-compose.prod.yml`

Criação da role e grants em `user`/`session`/`account`/`verification`/
`company`/`company_member` só em test-setup e docs (passo manual em prod);
`DATABASE_URL` (owner) injetada no container do app sem uso em runtime.

**Correção planejada:** migração SQL idempotente com grants core; remover
`DATABASE_URL` do compose prod.

**Status (2026-08-18):** Pendente — operacional, registrado no relatório
(AUD-19).

---

### 32. `company_select_policy` aberta / `findCompanyById` sem membership (AUD-20) ⏳ PENDENTE

**Arquivos:** `drizzle/0004`, `server/utils/auth/company/repository.ts`

Qualquer autenticado tem oráculo de existência de empresa por ID; a policy no
banco permite leitura de todas as empresas não-deletadas — ponto onde um
endpoint futuro vazaria dados. Endpoints atuais não vazam dados (IDs UUIDv4,
obtidos apenas por membros).

**Correção planejada:** restringir policy (membership via `EXISTS`) ou
membership check no `findCompanyById`; revisar fluxos legítimos.

**Status (2026-08-18):** Pendente — registrado no relatório (AUD-20).

---

### 33. Validações de input: tetos empresa, email regex, types (AUD-21/22/23) ✅ RESOLVIDO

**Arquivos:** `companies.post.ts`, `companies.update.post.ts`, `login.post.ts`,
`register.post.ts`, `forget-password.post.ts`, `send-verification-email.post.ts`,
`invite.post.ts`, `server/utils/shared/security.ts`

Sem tetos em name/cnpj/razaoSocial (btree quebra → 500); `email.includes('@')`
fraco em 3 rotas públicas; body types lax (password/cnpj numérico → 500).

**Correção (prompt 34):** tetos (200/30/200), `EMAIL_REGEX` compartilhado nas
4 rotas públicas, typeof checks → 400.

**Status (2026-08-18):** Implementado — specs dos handlers com inputs
gigantes/numéricos → 400. Detalhes no relatório (AUD-21/22/23).

---

### 34. `BETTER_AUTH_SECRET` não exigida no boot de produção (AUD-24) ✅ RESOLVIDO

**Arquivo:** `server/plugins/validate-env.ts`

Exigir secret com length ≥ 32 em produção (padrão AUD-05).

**Correção (prompt 35):** `missingProductionEnv` flagra ausente/encurtada
(`BETTER_AUTH_SECRET (mínimo 32 caracteres)`); fora de produção inalterado.

**Status (2026-08-18):** Implementado — specs: ausente/encurtada (31 chars) em
produção → flagrada; `>= 32` → ok; ausente fora de prod → ok. Detalhes no
relatório (AUD-24).

---

### 35. `/api/health` sem rate limit (AUD-25) ✅ ACEITO

**Arquivo:** `server/api/health.get.ts`

Health público ilimitado (1 SELECT/request) — aceito para health checks de
orquestrador; revisitar se virar problema de carga. Decisão registrada no
relatório (AUD-25).
