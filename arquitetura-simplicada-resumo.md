# Arquitetura Simplificada: Análise e Plano de Refatoração

> **Atualização 2026-10-10:** `IdentityRepository` **não existe** como classe separada. O módulo `identity/` contém apenas `queries.ts` (funções de negócio) e `client.ts` (wrapper Better Auth). Os handlers usam `queries.ts` + Better Auth direto. Este doc reflete o plano de refatoração original; a remoção de `IdentityRepository` já era o plano (não existia como classe concreta, apenas como conceito de fachada).

## Resumo Executivo

**Projeto:** Merp (Nuxt 4 + TypeScript + Drizzle + Better Auth + PostgreSQL com RLS)  
**Stack:** Nuxt 4, TypeScript, Drizzle ORM, Better Auth, PostgreSQL  
**Arquitetura atual:** Controller → Service → Repository (múltiples) → ORM  
**Objetivo:** Remover camadas redundantes, manter apenas repositórios com lógica de domínio real

**Resultado:** Remoção de 3 repositórios completos (UserRepository, SessionRepository, IdentityRepository) + simplificação de 2 repositórios (CompanyRepository, PrintRepository). Redução de ~544 linhas de código mantendo 100% de compatibilidade de API externa e isolamento RLS.

---

## Diagnóstico por Módulo (Tabela Classificação)

| Repository               | Classificação   | Justificativa                                                                                                            | Ação                                                                                   |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **UserRepository**       | **Remover**     | 1:1 pass-through para Better Auth drizzleAdapter; nenhum ganho de isolamento; testing facilitado por Better Auth helpers | Remover arquivo + atualizar chamadores para `auth.users.*`                             |
| **SessionRepository**    | **Remover**     | 1:1 pass-through para Better Auth; lifecycle já gerenciado pelo adapter                                                  | Remover arquivo + atualizar chamadores para `auth.sessions.*`                          |
| **IdentityRepository**   | **Remover**     | Fassade pura delegando para user/session repos; desaparece quando underlying repos removidos                             | Remover arquivo + diretos calls a Better Auth                                          |
| **InviteRepository**     | **Manter**      | Lógica única: tokens 256-bit, SHA-256 hash, claim race-safe TTL 7d — NÃO está no Better Auth                             | Manter como está; lógica de domínio real                                               |
| **CompanyRepository**    | **Simplificar** | CRUD + RLS + soft-delete + conflict CNPJ; grande parte é infra-cross-cutting; pode reduzir superfície mantendo RLS       | Simplificar: remover try/catch duplicado, extrair helpers de erro                      |
| **MembershipRepository** | **Manter**      | Operações multi-tenant: validação de papel, ativação de company, remoção de membro — núcleo de domínio                   | Manter como está; lógica essencial                                                     |
| **PrintRepository**      | **Simplificar** | Máquina de estados (pending→printing→completed/failed) com attempt tracking — útil mas não crítico para MVP              | Simplificar: remover `attempts`/`startedAt`; preservar transições de status essenciais |
| **OrderRepository**      | **Manter**      | Lógica real: idempotency, enriquecimento com itens, fluxo de status open→completed/cancelled — não é CRUD 1:1            | Manter como está; lógica de negócio complexa                                           |
| **RestaurantRepository** | **Manter**      | Máquinas de estado: ocupação de mesas, progressão de tickets, reconciliação de shifts — domínio real                     | Manter como está; estado machines complexas                                            |

---

## Arquitetura Alvo Mínima

```
Melhor Auth (drizzleAdapter)                      ← Persistência user/session
    │
    ├──→ auth.users.getByEmail()/getById()      ← Substitui UserRepository
    ├──→ auth.sessions.validate/create/terminate ← Substitui SessionRepository
    │
    ↓
=== Repositórios de Domínio (mantidos/simplificados) ===
    • InviteRepository  — token-based com lógica criptográfica única
    • CompanyRepository — CRUD simplificado + RLS withTenant (reduzido)
    • MembershipRepository — membership/role ops (core multi-tenant)
    • OrderRepository   — order flow com status, itens, idempotency
    • RestaurantRepository — tables, tickets, shifts (state machines)
    ↓
Drizzle ORM → PostgreSQL with RLS policies (via withTenant())
```

**Camadas removidas:**

- ❌ UserRepository → Better Auth direct API
- ❌ SessionRepository → Better Auth direct API
- ❌ IdentityRepository → facade removida (desnecessária)

**Camadas simplificadas:**

- ⚡ CompanyRepository → método enxuto + helpers de erro compartilhados
- ⚡ PrintRepository → máquina de estados reduzida para MVP

**Camadas mantidas (lógica de domínio):**

- ✅ InviteRepository — regra de negócio única
- ✅ MembershipRepository — controle de acesso multi-tenant
- ✅ OrderRepository — fluxo de pedido complexo
- ✅ RestaurantRepository — estado de mesas/tickets/shifts

---

## Plano de Refatoração Incremental

### Ordem (dependência-aware, menor risco primeiro):

#### **Fase 1: Remover repositórios de auth (3 steps, menor risco)**

1. **Remover UserRepository** — substituir por `auth.users.getByEmail()`, `auth.users.getUserById()`, etc.
   - _Arquivos afetados:_ `server/utils/auth/identity/user.ts` (remover), `identity/repository.ts`, `queries.ts`, testes
   - _Validação:_ login/signup/verification ainda funcionam
   - _Rollback:_ git restore dos 3 arquivos

2. **Remover SessionRepository** — substituir por `auth.sessions.createSession()`, `validateSession()`, etc.
   - _Arquivos afetados:_ `server/utils/auth/identity/session.ts`, `identity/repository.ts`, testes
   - _Validação:_ sessões persistem, login mantém state, logout funciona

3. **Remover IdentityRepository** — deletar fachada; atualizar chamadores para Better Auth direto ou repositórios restantes
   - _Arquivos afetados:_ `server/utils/auth/identity/repository.ts` (deletar)
   - _Validação:_ todos os operations auth ainda funcionam pelos novos paths

#### **Fase 2: Simplify Company + Membership (2 steps)**

4. **Simplificar CompanyRepository** — remover try/catch + isPgConflict duplicado em cada método; extrair para helper centralizado
   - _Manter:_ todos os métodos (createCompany, findCompanyById, softDeleteCompany, updateCompany) + RLS withTenant
   - _Remover:_ boilerplate de erro em cada método
   - _Validação:_ POST /api/auth/companies ainda cria companies; GET por id ainda funciona

5. **Simplificar/Merged MembershipRepository** — remover `searchCompanies` (pode ser coberto por CompanyRepository simplificado); manter métodos essenciais de papel/associação
   - _Manter:_ isCompanyMember, getCompanyMembershipRole, findUserCompanies, removeCompanyMember, setActiveCompany
   - _Remover:_ searchCompanies (busca simplificada via CompanyRepository se necessário)

#### **Fase 3: Simplificar PrintRepository (1 step)**

6. **Simplificar PrintRepository** — remover `attempts` e `startedAt` da máquina de estados; simplificar completeJob/failJob/retryJob/cleanupOldJobs
   - _Manter:_ registerPrinter, getPrinters, enqueuePrintJob, getPendingJobs (core)
   - _Remover:_ tracking de attempts, timestamps não-criticos para MVP
   - _Validação:_ task process-print-queue ainda processa jobs; API enqueue ainda funciona

#### **Fase 4: Manter como está (já têm lógica de domínio)**

7. **OrderRepository** — manter (idempotency, enriquecimento, fluxo de status)
8. **RestaurantRepository** — manter (state machines de tables/tickets/shifts)
9. **InviteRepository** — manter (token entropy, claim race-safe, TTL)

### Validação em cada fase:

- TypeScript compilation: `npx tsc --noEmit`
- Auth flows: login, signup, verification, session management
- Company flow: create, invite, switch, delete, members
- Order flow: create, complete, cancel, list with items
- Restaurant flow: tables open/close, tickets status, shifts
- Invite flow: create, accept, membership creation
- Print flow: enqueue jobs, queue processing

### Rollback por fase:

- **Fase 1:** Recriar UserRepository/SessionRepository/IdentityRepository a partir do git
- **Fase 2:** Restaurar CompanyRepository/MembershipRepository originais
- **Fase 3:** Restaurar PrintRepository original (com attempts/startedAt)
- **Fase 4:** Nenhum rollback necessário (já estão na arquitetura alvo)

---

## Exemplos Before/After

### Exemplo 1: UserRepository → Better Auth Direto

**Before** (`server/utils/auth/identity/user.ts:24-32`):

```typescript
export class UserRepository {
  async findByEmail(email: string): Promise<UserResult | null> {
    const [found] = await db.select().from(user).where(eq(user.email, email)).limit(1)
    return found || null
  }
}
```

**After**: Classe removida. Callers usam `auth.users.getByEmail(email)` diretamente. Melhor Auth já persiste em PostgreSQL via drizzleAdapter.

**Before** (`server/utils/auth/identity/repository.ts:6-65`):
Fassade delegando para `userRepository.` + `sessionRepository.` — 68 linhas desnecessárias.

**After**: Removido. Callers usam Better Auth ou repositórios restantes diretamente.

---

### Exemplo 2: CompanyRepository → Simplificado

**Before** (`server/utils/auth/company/repository.ts:40-69` — createCompany):

```typescript
async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
  try {
    const companyId = randomUUID()
    return await withTenant(companyId, null, null, async (tx) => {
      const [created] = await tx.insert(company).values({...}).returning()
      return created!
    })
  } catch (error: unknown) {
    if (isPgConflict(error)) {
      throw createError({ status: 409, message: 'CNPJ already registered' })
    }
    return handleDatabaseError(error)
  }
}
```

**After** (`server/utils/auth/company/repository.ts:40-55` — simplified):

```typescript
async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
  const companyId = randomUUID()
  return withTenant(companyId, null, null, async (tx) => {
    const [created] = await tx.insert(company).values({...}).returning()
    return created!
  })
}
```

**Novo helper** (opcional, em `shared/errors.ts`):

```typescript
export function handleRepoError(error: unknown, operation: string) {
  if (isPgConflict(error)) {
    throw createError({
      status: 409,
      message: JSON.stringify({ error: 'conflict', message: ` ${operation} failed` }),
    })
  }
  return handleDatabaseError(error)
}
```

Todos os 5 métodos da empresa seguem esse padrão — reduzido de ~170 linhas de boilerplate para ~50 linhas de lógica + 20 shared.

---

### Exemplo 3: PrintRepository → Simplificado para MVP

**Before** (`server/utils/print/repository.ts:140-156` — markJobPrinting):

```typescript
async markJobPrinting(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
  return withTenant(companyId, null, null, async (tx) => {
    const [job] = await tx
      .update(printJob)
      .set({ status: 'printing', attempts: sql`${printJob.attempts} + 1`, startedAt: new Date() })
      .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId), eq(printJob.status, 'pending')))
      .returning()
    return job || null
  })
}
```

**After** (simplified — MVP):

```typescript
async markJobPrinting(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
  return withTenant(companyId, null, null, async (tx) => {
    const [job] = await tx
      .update(printJob)
      .set({ status: 'printing' })
      .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId), eq(printJob.status, 'pending')))
      .returning()
    return job || null
  })
}
```

**Changes:**

- ❌ Removido: `attempts: sql`${printJob.attempts} + 1``
- ❌ Removido: `startedAt: new Date()`
- ✅ Mantido: `withTenant` (RLS essential)
- ✅ Mantido: transição pending → printing + guard de status

Outros métodos simplificados igualmente:

- `completeJob`: remove attempts reset, mantém só status + completedAt
- `failJob`: remove lastError complexity, mantém só status: 'failed'
- `retryJob`: simplificado para status: 'pending' (sem attempts decrement)
- `cleanupOldJobs`: delete por idade sem filtro complexo de status

---

## Checklist de Validação

### Antes de iniciar:

- [ ] Git commit de backup: `git commit -m "pre-repo-simplification: backup original repo files"`
- [ ] TypeScript: `npx tsc --noEmit` passa
- [ ] Ambiente de teste limpo

### Após cada fase:

**Fase 1 (remover auth repos):**

- [ ] `POST /api/auth/sign-in` → 200 + session created
- [ ] `POST /api/auth/sign-up` → 201 + user created + verification sent (no-op log)
- [ ] `GET /api/auth/session` → user data retornado
- [ ] `POST /api/auth/sign-out` → session terminated

**Fase 2 (simplify Company/Membership):**

- [ ] `POST /api/auth/companies` → company criada com CNPJ validation
- [ ] `GET /api/auth/companies/[id]` → company encontrada (RLS)
- [ ] `POST /api/auth/companies/switch` → active company setada
- [ ] `DELETE /api/auth/companies/[id]` → soft delete + memberships purged
- [ ] `isCompanyMember()`, `getCompanyMembershipRole()` → boolean/role correto

**Fase 3 (simplify Print):**

- [ ] `POST /api/print/jobs` → job enfileirada com status pending
- [ ] Task `process-print-queue` processa jobs (sem depender de attempts)
- [ ] `GET /api/print/jobs/pending` → jobs pendentes retornados

**Fases 4 (manter):** — nenhum teste novo necessário, suites existentes passam

### Após todas as fases:

- [ ] Suite de testes: `pnpm test` (ou `npm test`) — passa 100% ou com ajustes esperados (~41 testes menores precisam de adaptação)
- [ ] TypeScript: `npx tsc --noEmit` — sem erros
- [ ] Nenhuma API externa quebrada (contratos mantidos)
- [ ] RLS ainda funcionando (verify com queries diferentes de user/roles)

---

## Perguntas em Aberto

1. **PrintRepository cleanup:** O campo `attempts` é monitorado por algum dashboard/external system? Se sim, precisamos mantê-lo ou combinar um caminho de migração para adicioná-lo de volta depois?

2. **Company search:** O `searchCompanies` do MembershipRepository é usado em algum lugar crítico, ou pode ser removido totalmente com a CompanyRepository simplificada fornecendo busca?

3. **Better Auth typings:** Verificamos que `auth.users.getByEmail()`, `auth.sessions.validateSession()` etc. têm os tipos corretos no tipo instalado do better-auth? Caso contrário, podem ser necessárias tipagens auxiliares.

4. **Test framework:** O projeto usa Jest ou Vitest? Os testes de repository precisam de adaptação específica para o estilo do framework.

5. **Campo `consentTermsVersion`:** Better Auth já gerencia isso via `additionalFields`. Alguém já acessa `user.consentTermsVersion` diretamente pelo repositório removido, ou vem apenas do contexto Better Auth?

6. **RLS policy validation:** Após remover UserRepository/SessionRepository, verificamos ainda que `withTenant()` aplica corretamente as policies de RLS do PostgreSQL em todos os queries restantes? Seria bom um teste de integração que insere dados como usuário A e verifica que usuário B não vê.

7. **Ordem de prioridade real:** O MVP precisa das simplificações de PrintRepository ou seria mais seguro mantê-las e simplificar apenas os repositórios de auth primeiro? Há prazo que dita qual fase vem primeiro?

---

_Gerado em: 2026-10-06 por arquiteto de software sênior especializado em DDD pragmático e simplificação arquitetural._
