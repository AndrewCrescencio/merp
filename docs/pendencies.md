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

### 5. Endpoint de update de company

**Arquivo:** `server/api/auth/companies/` — não existe

Não há endpoint para atualizar nome, CNPJ ou razaoSocial de uma company.

**Solução:** Criar `server/api/auth/companies/[id].put.ts` (ou `companies.update.post.ts`).

---

### 6. Endpoint de remover/leave member

Não há endpoint para remover um usuário de uma company ou para um member sair.

**Solução:** Criar `server/api/auth/companies/members.delete.post.ts`.

---

### 7. Eventos de observabilidade do ciclo de vida da sessão

**Spec FR-023:** Emitir eventos `session_created`, `session_validated`,
`session_expired`, `session_invalidated` com session_id, user_id, tenant_id.

Atualmente só `session_expired` é logado (no middleware). Os demais não são emitidos.

---

### 8. Remover `withTenant` duplicado em `helpers.ts` ✅ RESOLVIDO

**Arquivo:** `server/utils/auth/helpers.ts` — linhas 153-165

Existe uma segunda implementação de `withTenant` que cria uma nova conexão postgres.
Não é usada em lugar nenhum — o repositório importa de `./tenant-context.ts`.

**Solução:** Remover o bloco duplicado.

**Status:** Removido o bloco duplicado e os imports não usados (`postgres`, `drizzle`,
`schema`). Aviso de import duplicado do build eliminado.

---

### 9. Rate limiter e lockout em memória

`checkRateLimit` e `checkAccountLockout`/`recordFailedAttempt` usam `Map` em memória.
Não persistem restart do servidor e não funcionam com múltiplos workers/instâncias.

**Solução:** Migrar para Redis ou banco de dados.

---

### 10. Páginas de UI — **ADIADO**

`app/app.vue` renderiza apenas `<NuxtWelcome />`. Não há páginas de login, registro,
dashboard, gerenciamento de companies, etc.

> **Adiado:** sem trabalho de frontend no momento. Backend/API apenas.

---

### 11. Timeout enforcement (FR-024)

Timeout de 5s para chamadas Better Auth e 10s para OAuth não implementado.
Nenhum wrapping de timeout nos métodos do repositório.

---

### 12. Consent withdrawal flow (FR-021)

O campo `consentWithdrawnAt` existe na tabela `user`, mas não há endpoint para
retirar consentimento, nem lógica de desativação/fila de deleção.

---

### 13. Error handler global (FR-026)

Não há plugin/error handler global do Nitro para capturar erros 500 inesperados
e retornar o formato padrão `internal_error`. Erros podem vazar detalhes internos.

---

### 14. Startup failure handling (FR-025)

Se a inicialização do Better Auth em `shared/auth.ts` falhar, os endpoints de auth
devem retornar 503 `auth_unavailable`. Não há graceful degradation nem health check.
