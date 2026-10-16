# Constitution — MERP

Princípios arquiteturais e de governança do projeto. Fonte única de verdade para decisões técnicas.

---

## 1. Spec-Driven Development

Toda feature nasce de uma **spec** em `specs/`. Spec = requisitos (FRs), modelo de dados, contratos API, threat model, LGPD. Código implementa a spec; divergência spec↔código = bug.

- `specs/README.md` = tracker de fases com gates
- `specs/decisions/ADR-XXX.md` = decisões irreversíveis
- `specs/000-foundation/*.md` = normas transversais (RLS, money, idempotency, endpoint-pattern, naming, snapshot, fiscal-br)

---

## 2. Vertical Slices (Package by Feature)

Arquitetura por _bounded context_ (ADR-001, ADR-008). Cada contexto é autônomo:

```
server/utils/auth/identity/    # Conta + sessão (via Better Auth)
server/utils/auth/company/     # Tenant + membership
server/utils/auth/invite/      # Convites
server/utils/order/            # Core Order
server/utils/print/            # Impressão operacional
server/utils/restaurant/       # Restaurant Pack
server/utils/shared/           # Cross-cutting (handler, errors, security, audit, etc.)
```

**Regra**: Contextos não se importam (ESLint `no-restricted-imports` enforce). Comunicação via `withTenant` + repositórios ou eventos.

---

## 3. Handler → Repository → Drizzle (Sem Service Layer)

Padrão deliberado (ADR-008):

```
handler (server/api/...)
  → validação Zod
  → withTenant(companyId, locationId, userId, fn)
    → Repository (concreto, <10 métodos, 1-2 tabelas)
      → Drizzle ORM / postgres-js
        → PostgreSQL + RLS (merp_app, NOBYPASSRLS)
```

- **Nenhuma interface `IRepository`** salvo 2+ implementações reais
- Repository = classe singleton OU object + type alias (preferir object para novos)
- Handlers chamam repository direto

---

## 4. RLS First (Fail-Closed)

Isolamento multi-tenant no banco, não na aplicação (ADR-002):

- Todas as tabelas operacionais: `company_id` + `location_id` NOT NULL
- `withTenant` seta GUCs: `app.tenant_id`, `app.location_id`, `app.user_id`
- Policies: `USING = WITH CHECK = company_id = get_tenant_id()` e, nas tabelas location-scoped, `AND (location_id = get_location_id() OR get_location_id() IS NULL)` — o escape `OR ... IS NULL` dispensa só o filtro de location (escopo company), o tenant continua exigido. Padrão normativo de ADR-002; sem o escape, `withTenant(companyId, null, ...)` negaria todas as linhas
- Role `merp_app` = `NOBYPASSRLS` (runtime); role `merp` = superuser (apenas migrações)
- **Canary test roda primeiro na CI** — falha = pipeline para

---

## 5. Dinheiro: `numeric(12,2)` + Half-Up por Linha (ADR-003)

- `unit_price`, `line_total` = `numeric(12,2)`
- Arredondamento **half-up por linha** (`round_half_up` function SQL)
- Total = soma das linhas no servidor (nunca input do cliente)
- `quantity` = `numeric(12,3)` onde houver fracionado (kg)

---

## 6. Idempotência: `UNIQUE (company_id, key)` na Tabela da Operação

- Header `Idempotency-Key` obrigatório em escritas críticas (pay, criar pedido)
- Chave única na tabela da operação (`order`, `payment`)
- Tabela separada `idempotency_record` só para fiscal/pagamento (auditoria)

---

## 7. Segurança (Tier 0 Invariants)

| Medida          | Implementação                                                           |
| --------------- | ----------------------------------------------------------------------- |
| Rate limit      | IP 20/min, email 5/min, user 60/min (sliding window)                    |
| Lockout         | Dual-tier: (email+IP) 10 tentativas + global email 50 → 30min           |
| CSRF            | Double-submit: cookie `csrf_token` + header `X-CSRF-Token`              |
| CORS            | Origem explícita (sem wildcard); `X-CSRF-Token` no preflight            |
| Cookies         | `merp-session_token`: httpOnly, Secure (prod), SameSite=Lax             |
| Anti-enumeração | 201 genérico para register/login/recovery (email existe ou não)         |
| HIBP            | Verificação breach no registro/reset senha                              |
| PII Audit       | Acesso a `/me` e `/export` logado em `auth_event` (sem `name` nos logs) |
| LGPD Consent    | `consent_terms_version`, `accepted_at`, `withdrawn_at` em `user`        |

---

## 8. Sessão: 7d Fixo, Sem Refresh (ADR-004)

- `disableSessionRefresh: true` no Better Auth
- TTL 7 dias fixo para backoffice
- Perfil PDV compartilhado: regra operacional "logout fim de turno" (não no código)

---

## 9. API Versioning: `/api/v1` Desde Já (ADR-005)

- Novos endpoints em `/api/v1/`
- Escopo de tenant no path: `/api/v1/companies/{companyId}/...` (R5) — o
  `companyId` nunca vem do body (fail-closed, §4)
- Fluxos de auth (`login`, `register`, `logout`, `password/*`, `email/*`) e
  `health` ficam em `/api/auth` e `/api/health` **sem versionamento**
  (contrato próprio)
- Sem versionamento = quebra futura

---

## 10. PK: UUID Nativo para Novas Tabelas (ADR-006)

- Novas tabelas: `uuid` (PK) + `uuid` FKs
- Tabelas Better Auth legadas: `text` (compatibilidade)
- Cast implícito `uuid→text` funciona no PG 16

---

## 11. Test Suite Roda como `merp_app` (ADR-007)

- CI: PostgreSQL container + `APP_DATABASE_URL=merp_app`
- Testes de integração = `DB_AVAILABLE=true`
- Canary RLS + grants parity + concurrency = gates obrigatórios

---

## 12. 2FA Adiado (ADR-010)

- Removido do escopo MVP (landmine: adapter × 2FA × RLS location_id)
- Critérios para reativar: feature flag dedicada + migration + testes RLS

---

## 13. Ponytail / Simplicidade

- **YAGNI**: não construa para "depois"
- **Stdlib primeiro**: nativo antes de dependência
- **Deletar > Adicionar**: código morto removido, não arquivado
- **Uma fonte, um fato**: cada fato normativo vive em um lugar; outros linkam
- **Documentação reflete código**: divergência doc↔código = bug

---

## 14. O Que Nunca Fazer

- Alterar migrations, políticas RLS, lógica de auth, lógica fiscal/financeira sem ADR
- Remover requisitos de `security.md`/`failure.md`/`api.md`
- Editar esta constituição sem ADR
- Rodar migrations fora de banco local
- Tocar em `.env` reais ou commitar segredos
- Push, merge, PR sem revisão
- Adicionar features fora do roadmap MVP
- Refatorar arquitetura por gosto de estilo

---

## 15. Glossário Mínimo

| Termo               | Definição                                                       |
| ------------------- | --------------------------------------------------------------- |
| **Tenant**          | = `company` — unidade de isolamento de dados                    |
| **RLS**             | Row Level Security — policies PostgreSQL para isolamento        |
| **GUC**             | Grand Unified Configuration — `app.tenant_id`, etc.             |
| **withTenant**      | Helper que seta GUCs e roda callback em transação               |
| **Vertical Slice**  | Feature completa: API + Repository + Schema + Testes            |
| **Bounded Context** | Contexto delimitado (auth, order, print, restaurant...)         |
| **ADR**             | Architecture Decision Record — decisão irreversível             |
| **FR / SC**         | Functional Requirement / Success Criteria                       |
| **MVP**             | Auth implementado; Core Order em progresso; Restaurant planeado |

---

_Última verificação contra código: 2026-10-10 (commit `$(git rev-parse --short HEAD)`)_
