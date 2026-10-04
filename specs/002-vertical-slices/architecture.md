# Reestruturação para Vertical Slices (Package by Feature)

**Status**: Implementado (fases 1–3 e 4[middleware] concluídas; fases 0, 5 e 6 parciais) | **Data**: 2026-08-06 | **Repo**: merp

> Objetivo: reorganizar o código do contexto `auth` (e servir de modelo para
> `fiscal` e `financeiro`) de uma organização **por camada técnica** para uma
> organização **por feature** — cada feature é um "pacote" vertical com seu
> próprio repositório, tipos (DTOs), helpers e testes, no espírito do
> _package by feature_ comum em Go.

---

## 1. Diagnóstico da Estrutura Atual

### 1.1 Inventário

```
server/
├── api/
│   ├── health.get.ts                        # 23 linhas
│   └── auth/                                # 18 handlers (35–88 linhas cada)
│       ├── register.post.ts  login.post.ts  logout.post.ts  me.get.ts
│       ├── deactivate.post.ts  export.get.ts
│       ├── companies.post.ts  companies.get.ts  companies.switch.post.ts
│       ├── companies.update.post.ts  companies.delete.post.ts
│       ├── companies/members.delete.post.ts
│       ├── consent/withdraw.post.ts
│       ├── invite.post.ts  invites.get.ts  invites.accept.post.ts
├── middleware/
│   ├── auth.ts                              # validação de sessão + tenant ctx (97)
│   └── pii-audit.ts                         # auditoria de acesso a PII (26)
├── tasks/
│   └── purge-sessions.ts                    # limpeza diária de sessões
├── error-handler.ts                         # normalização global de erros
└── utils/
    ├── schema.ts                            # 198 linhas — TODAS as tabelas
    ├── db.ts                                # conexão (infra)
    ├── apply-custom-sql.ts                  # infra (migrações RLS)
    ├── test-setup.ts                        # infra (setup de testes)
    └── auth/
        ├── repository.ts                    # 881 linhas — GOD REPOSITORY
        ├── helpers.ts                       # 301 linhas — MISTURA DE CONCERNAS
        └── tenant-context.ts                # withTenant (infra)
shared/
├── auth.ts                                  # instância Better Auth
└── logger.ts                                # logger
```

### 1.2 Problemas Identificados

| #   | Problema                                                                                                                                                                                         | Evidência                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| P1  | **God repository**: um único `IAuthRepository` com 30+ métodos cobre 5 subdomínios distintos (identidade, sessão, empresa/tenant, convite, consentimento/auditoria)                              | `repository.ts` — 881 linhas                                  |
| P2  | **Coesão inexistente**: não existe o conceito de "feature" no código — handlers de assuntos diferentes apontam todos para o mesmo repositório e helpers                                          | todos os handlers importam `authRepository`                   |
| P3  | **Helpers misturam concernas**: contrato de erro HTTP, validação, rate limiting, lockout e timeouts vivem no mesmo arquivo                                                                       | `helpers.ts` — 301 linhas                                     |
| P4  | **Schema único mistura domínios**: tabelas de auth puro (user/session/account) convivem com tenant (company/company_member), convite (invite) e segurança (auth_security_state) no mesmo arquivo | `schema.ts` — 198 linhas                                      |
| P5  | **Risco de acoplamento futuro**: quando `fiscal` (core domain) crescer, o padrão atual forçará novos `IXxxRepository` globais em `server/utils/{context}/` — replicando o mesmo problema         | constituição §II prevê `server/utils/{context}/repository.ts` |
| P6  | **Interface gigante viola ISP**: qualquer handler depende de métodos de todos os subdomínios; mocks de teste precisam stubbear 30+ métodos                                                       | `repository.spec.ts` / mocks nos handlers                     |
| P7  | **Tabelas compartilhadas sem dono claro**: `auth_event` (auditoria) e `auth_security_state` (segurança) não têm "feature" dona                                                                   | usados por middleware, repository e handlers                  |

### 1.3 O que JÁ está bom (não mudar)

- Handlers finos e delgados (validar → chamar → responder) — padrão correto.
- Co-locação de testes (`.spec.ts` / `.test.ts`) junto ao código.
- `withTenant` como único ponto de entrada de contexto de tenant.
- Contrato de erro global (`error-handler.ts`) e helpers `sendXxxError`.
- Nomes de arquivo por rota (`register.post.ts` etc.).

---

## 2. Modelo Alvo: Package by Feature (estilo Go)

### 2.1 Princípios

1. **Uma feature = um diretório vertical**: contém tudo o que a feature
   precisa — repositório, DTOs, helpers, testes. Nada de importar a feature
   do vizinho.
2. **API pública explícita**: cada feature exporta apenas o necessário
   (ex.: `identity/repository.ts` exporta `identityRepository`, a classe
   `IdentityRepository` e os DTOs/interfaces). O resto
   fica privado ao diretório.
3. **Sem "god objects"**: se um repositório tem mais de ~8–10 métodos ou
   toca mais de 3 tabelas, é sinal de que há mais de uma feature ali dentro.
4. **Fronteiras por domínio de negócio**, não por camada técnica.
5. **Infra compartilhada explícita**: `db.ts`, `db/tenant-context.ts`,
   `schema registry`, contrato de erros ficam num diretório `shared` do
   servidor — a única exceção à regra da verticalidade.

### 2.2 Restrições do Nuxt/Nitro que moldam o design

| Restrição                                                      | Consequência de design                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL da rota = caminho do arquivo** em `server/api/`          | Handlers NÃO podem ser aninhados por feature sem mudar a URL. Ex.: `server/api/auth/identity/register.post.ts` viraria `/api/auth/identity/register`. Logo, os handlers continuam em `server/api/auth/` (flat) — a verticalidade se expressa no **núcleo** (`server/utils/auth/<feature>/`). |
| **Auto-imports** (`nitro.imports.dirs`)                        | Hoje importa `server/utils/auth` inteiro. Após a divisão, apontar para os arquivos certos ou manter imports explícitos (o código já usa imports explícitos via `~~`).                                                                                                                        |
| **Drizzle exige um ponto de entrada de schema** para migrações | `drizzle.config.ts` aponta para `./server/utils/schema.ts`. O schema pode ser dividido por feature **desde que** exista um registry raiz re-exportando tudo (única fonte para `drizzle-kit` e para o adapter do Better Auth).                                                                |
| **Middleware é global**                                        | `server/middleware/auth.ts` é cross-cutting — permanece onde está, mas passa a usar os repositórios das features (não o god repository).                                                                                                                                                     |

---

## 3. Estrutura Alvo

### 3.1 Árvore completa

```text
server/
├── api/
│   ├── health.get.ts                          # público (infra)
│   ├── metrics.get.ts                         # público, Prometheus sem PII
│   ├── .well-known/security.txt.get.ts        # público (RFC 9116)
│   └── auth/                                  # ← ROTAS: permanecem flat (21 handlers)
│       ├── register.post.ts  login.post.ts  logout.post.ts  me.get.ts
│       ├── deactivate.post.ts  export.get.ts
│       ├── verify-email.get.ts  send-verification-email.post.ts
│       ├── forget-password.post.ts  reset-password.post.ts
│       ├── reset-password/[token].get.ts
│       ├── companies.post.ts  companies.get.ts  companies.switch.post.ts
│       ├── companies.update.post.ts  companies.delete.post.ts
│       ├── companies/members.delete.post.ts
│       ├── consent/withdraw.post.ts
│       └── invite.post.ts  invites.get.ts  invites.accept.post.ts
├── middleware/
│   ├── auth.ts                                # usa identity + audit
│   └── pii-audit.ts
├── tasks/
│   └── purge-sessions.ts                      # usa identity (sessions)
├── error-handler.ts
└── utils/
    ├── apply-custom-sql.ts                      # infra (migrações RLS)
    ├── db.ts                                    # conexão (infra)
    ├── test-setup.ts                            # infra (setup de testes)
    ├── schema/
    │   ├── index.ts                             # registry: re-exporta tudo
    │   ├── identity.ts                          # user, session, account, verification
    │   ├── company.ts                           # company, company_member
    │   ├── invite.ts                            # invite
    │   └── security.ts                          # auth_security_state
    ├── shared/                                  # infra + cross-feature do servidor
    │   ├── audit.ts                             # createAuthEvent (auth_event)
    │   ├── auth-context.ts                      # tipos de event.context (h3 augmentation)
    │   ├── background.ts                        # fire-and-forget com waitUntil (FR-023)
    │   ├── csrf.ts                              # double-submit + isCsrfExempt
    │   ├── email.ts                             # fila Resend (queueEmail)
    │   ├── errors.ts                            # sendXxxError + normalize
    │   ├── hibp.ts                              # breach check (k-anonymity)
    │   ├── ip.ts                                # getClientIp (TRUST_PROXY)
    │   ├── purge.ts                             # corpo compartilhado das purge tasks
    │   └── security.ts                          # rate limit + lockout + CNPJ (auth_security_state)
    ├── db/tenant-context.ts                     # withTenant (infra de tenant, usado pelas features)
    └── auth/                                    # ← VERTICAL SLICES
        ├── identity/                            # FEATURE: conta + sessão
        │   ├── repository.ts                    # IdentityRepository + identityRepository
        │   └── repository.test.ts               # integração (DB real)
        ├── company/                             # FEATURE: tenant/membership
        │   ├── repository.ts
        │   └── repository.test.ts
        └── invite/                              # FEATURE: convites
            ├── repository.ts
            └── repository.test.ts
shared/                                        # infra do app (inalterado)
├── auth.ts
└── logger.ts
```

### 3.2 Mapa feature → endpoints → tabelas → métodos atuais

> Estado real (2026-09-21 — sem interfaces `I*Repository` nem classes
> `Drizzle*`: uma classe concreta + singleton por feature).

| Feature      | Endpoints (handlers)                                                                                                                      | Tabelas                                                              | Métodos atuais                                                                                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **identity** | register, login, logout, me, deactivate, export, consent/withdraw, verify-email, send-verification-email, forget-password, reset-password | user, session, account, verification, auth_event (leitura p/ export) | register, signIn, sendVerificationEmail, verifyEmail, requestPasswordReset, resetPassword, validateResetToken, findByEmail, findById, createSession, validateSession, terminateSession, terminateUserSessions, updateUser, isEmailTaken, withdrawConsent, deactivateUser, getUserSessions, listUserAuthEvents (19) |
| **company**  | companies.\*, companies/members.delete                                                                                                    | company, company_member, session (activeCompanyId)                   | createCompany, createCompanyWithOwner, createCompanyMember, searchCompanies, findCompanyById, findUserCompanies, isCompanyMember, getCompanyMembershipRole, removeCompanyMember, setActiveCompany, getActiveCompany, softDeleteCompany, updateCompany (13)                                                         |
| **invite**   | invite, invites.get, invites.accept                                                                                                       | invite                                                               | createInvite, findPendingInvite, listCompanyInvites, acceptInvite (4)                                                                                                                                                                                                                                              |
| **security** | (usado por register/login)                                                                                                                | auth_security_state                                                  | checkIpRateLimit, checkEmailRateLimit, checkUserRateLimit, checkAccountLockout, recordFailedAttempt, resetFailedAttempts (+ puras: evaluateRateLimit, evaluateLockout)                                                                                                                                             |
| **audit**    | (usado por middleware + handlers)                                                                                                         | auth_event                                                           | createAuthEvent (+ `background()` p/ fire-and-forget com `waitUntil`)                                                                                                                                                                                                                                              |

> Nota sobre a regra 3 (§3.3, >10 métodos): `identity` (19) e `company` (13)
> excedem o teto. Justificativa registrada: a divisão por subdomínio
> (identidade/sessão/consentimento vs. tenant/membership) já foi feita; fatiar
> mais (ex.: `session/` separado) fica deferido até um segundo contexto
> (`fiscal`, `financeiro`) forçar o padrão.

### 3.3 Regras de ouro (convenções a registrar na constituição)

1. Handler (`server/api/auth/*`) importa **apenas** os repositórios/helpers
   da feature que serve — nunca o repositório de outra feature.
2. Feature **nunca importa** o repositório de outra feature. Se precisar,
   é sinal de fronteira errada → revisar a fronteira.
3. Repositório com >10 métodos deve ser justificado ou dividido.
4. `schema/index.ts` é o único arquivo importado por `drizzle.config.ts`
   e pelo adapter do Better Auth.
5. Toda feature nova segue o template: `repository.ts` + `dto.ts` +
   testes co-localizados; helpers só quando o handler crescer.
6. Cross-feature (rate limit, tenant, erro) vive em `server/utils/shared/`.

---

## 4. Plano de Migração

**Progresso real** (2026-08-09): Fases 1–3 e a parte de middleware da Fase 4
concluídas. Desvios do plano: sem `dto.ts` por feature (os DTOs ficaram no
próprio `repository.ts`); sem interfaces `I*Repository` nem classes
`Drizzle*` (classe concreta + singleton por feature); `db.ts`,
`db/tenant-context.ts`, `apply-custom-sql.ts`
e `test-setup.ts` permaneceram em `server/utils/` (não movidos para
`shared/`); `security` e `audit` foram para `server/utils/shared/` (D3).
Pendente: Fase 5 (verificação final) e Fase 6 (governança).

### Fase 0 — Fundação (sem mudança de comportamento)

- Criar `server/utils/shared/` e mover: `db.ts`, `db/tenant-context.ts`,
  `apply-custom-sql.ts`, `test-setup.ts`.
- Mover helpers de erro HTTP (`sendXxxError`, `classifyDatabaseError`,
  `handleDatabaseError`, `withTimeout`, `TimeoutError`) para
  `server/utils/shared/errors.ts`.
- Atualizar todos os imports (`~~/server/utils/auth/helpers` → caminhos
  novos). Rodar `pnpm test` + `pnpm lint` + `pnpm build` — verde antes de
  prosseguir.

### Fase 1 — Dividir schema

- Criar `server/utils/schema/{identity,company,invite,security}.ts` com as
  tabelas de cada feature (mover literalmente, sem renomear colunas).
- Criar `server/utils/schema/index.ts` re-exportando tudo (mesmo formato
  do `* as schema` atual).
- Atualizar `drizzle.config.ts` → `./server/utils/schema/index.ts`.
- Gerar migration vazia para validar que o registro continua íntegro
  (`drizzle-kit generate` sem diff → confirmar com `drizzle-kit check`).
- Rodar testes de integração (RLS continua valendo).

### Fase 2 — Dividir o god repository

- Criar `auth/identity/repository.ts` (19 métodos), `auth/company/repository.ts`
  (13), `auth/invite/repository.ts` (4) — copiando implementações atuais.
- Mover DTOs para `dto.ts` de cada feature.
- Extrair `security/security.ts` (rate limit + lockout) e `audit/audit.ts`
  (createAuthEvent + emitSessionEvent) dos helpers.
- **Bridge temporária**: `server/utils/auth/repository.ts` passa a re-exportar
  as features (`export const authRepository = { ...identityRepository,
...companyRepository, ...inviteRepository }` com o mesmo tipo) para não
  quebrar os handlers em um único commit.

### Fase 3 — Migrar handlers feature a feature

Para cada handler (ordem sugerida: invite → company → identity):

1. Trocar `authRepository` pelo repositório da feature.
2. Ajustar o `.spec.ts` (mock do novo repositório, sem stubs de métodos de
   outras features — bônus do ISP).
3. Rodar testes do endpoint.
4. Remover do bridge os métodos já migrados.

Quando nenhum handler usar mais o bridge: **deletar** `repository.ts`.

### Fase 4 — Middleware, tasks e consolidação

- `server/middleware/auth.ts`: usar `identity` (validateSession via Better
  Auth continua) + `audit` (emitSessionEvent).
- `server/middleware/pii-audit.ts`: usar `audit`.
- `server/tasks/purge-sessions.ts`: usar `identity`.
- Atualizar `nuxt.config.ts` (`nitro.imports.dirs`).

### Fase 5 — Verificação final

- `pnpm test` (unit + integração), `pnpm lint`, `pnpm build`.
- `pnpm format:check`.
- Revisar imports: nenhum import cruzado entre features
  (`auth/identity` não importa `auth/company`, etc.) — checável com
  grep/eslint rule custom (ver Riscos).

### Fase 6 — Documentação & governança

- **Constituição (§II)**: substituir o modelo "repository por contexto"
  pelo modelo "feature = diretório vertical"; adicionar regras 1–6 do §3.3.
- **AGENTS.md**: apontar para este documento.
- **`specs/001-auth-context/plan.md`**: atualizar a seção "Project Structure".

---

## 5. O que NÃO muda

- URLs das rotas (`/api/auth/...` intactas — handlers flat).
- Contrato de erros HTTP (`{ error, message }`) e `error-handler.ts`.
- `withTenant` + RLS (defesa em profundidade).
- Co-locação e convenção de nomes de testes.
- Padrão handler fino → repositório → resposta.
- `shared/auth.ts` e `shared/logger.ts`.

---

## 6. Decisões em aberto (confirmar antes da Fase 2)

| #   | Decisão                                                                              | Resolução                                                                                 |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| D1  | Nome dos diretórios de feature                                                       | **Resolvido**: `identity` / `company` / `invite` sob `server/utils/auth/`                 |
| D2  | Schema: registry único vs glob                                                       | **Resolvido**: registry único em `schema/index.ts`                                        |
| D3  | `auth_event` vira feature própria ou vai para `shared/`?                             | **Resolvido**: `shared/audit.ts` e `shared/security.ts` — cross-feature (regra 6 do §3.3) |
| D4  | Nível de rigidez: quanto os contextos futuros (`fiscal`, `financeiro`) devem adotar? | Em aberto — recomenda-se: obrigatório para código novo                                    |
| D5  | Nome do doc/feature no Speckit                                                       | **Resolvido**: `002-vertical-slices`                                                      |

---

## 7. Riscos & Mitigação

| Risco                                                | Prob. | Mitigação                                                                                                                          |
| ---------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mudança grande em 1 commit quebra tudo               | Média | Bridge temporário (Fase 2) + migração por endpoint (Fase 3) + CI verde a cada fase                                                 |
| Import cruzado entre features volta a aparecer       | Média | Regra de lint (eslint `no-restricted-imports` para `server/utils/auth/{outra-feature}`) + revisão de PR                            |
| RLS/tenant quebra durante refactor                   | Baixa | Nenhuma query é reescrita — só movida; testes de integração (`repository.test.ts`) validam comTenant/RLS                           |
| Drizzle registry com re-exports perde tipagem        | Baixa | `export * from './identity'` preserva tipos; validar com `drizzle-kit check` + build                                               |
| Custo alto sem valor visível (handlers já são finos) | Média | O valor é no **núcleo** (repositórios/helpers/schema) e na **escalabilidade** — sem a divisão, `fiscal` replicará o god repository |

---

## 8. Resultado Esperado

- `server/utils/auth/` deixa de ter arquivo >300 linhas; cada feature
  fica com <200 linhas de núcleo + DTOs.
- Mocks de teste por feature: cada handler mocka só o que usa (ISP).
- Novo contexto (`fiscal`, `financeiro`) nasce já no padrão vertical.
- Migração reversível por fase — cada fase termina com testes verdes.
