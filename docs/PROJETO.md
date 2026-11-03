# MERP — Estado do Produto

ERP multi-tenant (Nuxt 4/Nitro, Better Auth, Drizzle, PostgreSQL+RLS) focado em restaurante.

## Estado Atual (2026-11-02)

**MVP:** backend com auth robusto, company/membership/invite consolidado, e bases de order/restaurant/print parcialmente implementadas. Frontend apenas com telas de autenticação.

**Bloqueadores de MVP:**

1. ✅ Location bootstrap (P0.1 — implementado, ver commit `fe3d1ac`)
2. ✅ Produtos CRUD (P0.2 — implementado, ver `.kiro/specs/product-crud/P0.2-summary.md`)
3. ✅ Mesas/estações/roles (P0.3 — implementado, ver `.kiro/specs/p03-restaurant-kitchen/P0.3-summary.md`)
4. ✅ Kitchen ticket corrigido (P0.4 — implementado, ver `.kiro/specs/p04-kitchen-ticket/P0.4-summary.md`)
5. ✅ Mesa↔order (P0.5 — implementado, ver `.kiro/specs/p05-table-order/P0.5-summary.md`)
6. ⏸️ FSM de order (preparing, ready) — não iniciado
7. ⏸️ Dinheiro server-side (SUM SQL, CHECKs) — não iniciado

### Matriz por Funcionalidade

| Contexto               | Implementado                                                                                                                     | Parcial                                                                                                                                        | Apenas Especificado                                                                                     | Sem Documentação               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Auth/Identity**      | Register, login, logout, verify email, reset password, 2FA adiado (ADR-010)                                                      | TTL por perfil (ADR-004: spec existe, código não)                                                                                              | —                                                                                                       | —                              |
|                        | Fonte: `server/api/auth/*.post.ts`, `server/utils/auth/identity/*`                                                               |                                                                                                                                                |                                                                                                         |                                |
| **Company/Membership** | Criar empresa+owner, buscar, editar, soft delete, criar/aceitar convite (owner-only)                                             | Roles só `owner`/`member`; falta `manager`/`waiter`/`cashier`/`kitchen`                                                                        | Transferência de ownership                                                                              | —                              |
|                        | Fonte: `server/api/v1/companies/*.ts`, `server/utils/auth/company/repository.ts`                                                 |                                                                                                                                                |                                                                                                         |                                |
| **Location**           | Bootstrap "Matriz" na criação da empresa, CRUD completo (GET/POST/PATCH/DELETE)                                                  | —                                                                                                                                              | —                                                                                                       | —                              |
|                        | Fonte: `server/utils/auth/company/location-repository.ts`, commits `fe3d1ac`, `b5b6d5b`                                          |                                                                                                                                                |                                                                                                         |                                |
| **Produtos**           | CRUD completo (name, sku, unitPrice, isActive), validação de preço, owner/manager-only                                           | Sem category/menu                                                                                                                              | —                                                                                                       | —                              |
|                        | Fonte: `server/utils/auth/company/product-repository.ts`, `P0.2-summary.md`                                                      |                                                                                                                                                |                                                                                                         |                                |
| **Core Order**         | Criar order+itens (dine_in/takeout), listar, detalhe, complete/cancel, idempotência (header+coluna)                              | Só 2 tipos (spec: 6); FSM básica (open→completed\|cancelled); sem itens incrementais; total em JS (deveria ser SQL); sem autorização por papel | delivery, retail, wholesale, quotation; FSM completa (preparing, ready); endpoint de itens incrementais | Total server-side com SUM      |
|                        | Fonte: `server/utils/order/repository.ts`, `drizzle/0001_baseline.sql`                                                           |                                                                                                                                                |                                                                                                         |                                |
| **Restaurant**         | CRUD mesas/estações, openTable, closeTable, CRUD itens de order, kitchen ticket corrigido, transições (start/ready/serve/cancel) | Mesa↔order vinculado (P0.5); kitchen ticket funcional (P0.4); sem KDS display; cashier shift confia no cliente                                 | KDS por estação; roteamento automático item→estação                                                     | Worker de impressão real       |
|                        | Fonte: `server/utils/restaurant/*`, `P0.3/P0.4/P0.5-summary.md`                                                                  |                                                                                                                                                |                                                                                                         |                                |
| **Print**              | Schema, cadastro printer/job, fila de impressão                                                                                  | Sem worker/driver/renderer/templates                                                                                                           | ESC-POS, templates Handlebars                                                                           | Worker/retry/DLQ               |
|                        | Fonte: `server/utils/print/repository.ts`, `server/templates/print/*.hbs`                                                        |                                                                                                                                                |                                                                                                         |                                |
| **Frontend**           | Telas de auth (login, register, verify, reset)                                                                                   | —                                                                                                                                              | Shell pós-login, seletor de empresa/location, dashboard, salão, pedido, KDS, caixa, fila de impressão   | Componentes de domínio, stores |
|                        | Fonte: `app/pages/auth/*.vue`                                                                                                    |                                                                                                                                                |                                                                                                         |                                |
| **RLS/Infra**          | 17 tabelas com ENABLE+FORCE, policies por operação, role merp_app NOBYPASSRLS, matriz de RLS, canary cross-tenant                | Auth tables sem RLS (globais); sem CHECK constraints monetárias/status; sem rate limit em mutações operacionais                                | Auditoria operacional (quem criou/completou order)                                                      | —                              |
|                        | Fonte: `drizzle/0002_rls_policies_grants.sql`, `server/utils/rls-matrix.test.ts`                                                 |                                                                                                                                                |                                                                                                         |                                |
| **Fiscal/Pagamentos**  | —                                                                                                                                | —                                                                                                                                              | NFC-e/SAT (cupom fiscal), pagamentos integrados (Pix, cartão), ERP B2B                                  | —                              |

## Regras de Negócio

### Validadas no Código

1. **Multi-tenancy via RLS com GUC** — isolamento de tenant por `get_tenant_id()` + location por `get_location_id() OR get_location_id() IS NULL`  
   _Fonte:_ `drizzle/0002_rls_policies_grants.sql`, `server/utils/db/tenant-context.ts:withTenant`

2. **Better Auth dono do schema de auth** — tabelas `user`, `session`, `account`, `verification`, `auth_event`, `auth_security_state` geridas pelo Better Auth via Drizzle adapter  
   _Fonte:_ `shared/auth.ts`, `drizzle/0001_baseline.sql`

3. **Dinheiro em `numeric(12,2)` com round_half_up por linha** — `line_total = round_half_up(unit_price * quantity - discount_applied)`  
   _Fonte:_ `server/utils/schema/order-item.ts:33`, `drizzle/0000_functions_and_roles.sql:round_half_up`

4. **Quantidade em `numeric(10,3)`** — spec pede `numeric(12,3)`, código atual é `numeric(10,3)`  
   _Fonte:_ `server/utils/schema/order-item.ts:29`

5. **Sem Service Layer** — Handler → Repository → Drizzle direto, sem interface `IRepository`  
   _Fonte:_ `docs/decisions.md`, repositórios em `server/utils/*/repository.ts`

6. **Rate limit por usuário** — 60 req/min por usuário autenticado (sliding window), IP 20/min, email 5/min  
   _Fonte:_ `server/middleware/auth.ts`, ADR não especifica, código implementa

7. **Soft delete em dados fiscais/auditáveis** — tabelas com `deleted_at` (company, user, order); `DELETE` nunca executado  
   _Fonte:_ `docs/decisions.md`, `server/utils/schema/*.ts`

8. **CNPJ validado com dígito verificador** — validação em `isValidCnpj()`, conflito retorna 409  
   _Fonte:_ `server/utils/shared/security.ts:39`, `server/api/v1/companies/index.post.ts`

9. **Convite single-use com token SHA-256** — token 256 bits, apenas hash persistido, TTL 7 dias, claim atômico  
   _Fonte:_ `server/utils/auth/invite/repository.ts:38`, `drizzle/0001_baseline.sql:invite`

10. **FSM de kitchen ticket** — `pending → in_progress → ready → served|cancelled`  
    _Fonte:_ `server/utils/restaurant/repository.ts:11:KITCHEN_TRANSITIONS`

11. **Idempotência de order** — header `Idempotency-Key` (alias no body), replay da resposta original em retry, 409 em payload diferente  
    _Fonte:_ `drizzle/0003_order_idempotency_fingerprint.sql`, `server/utils/order/repository.ts:62:orderFingerprint`

12. **CSRF double-submit** — `x-csrf-token` obrigatório; isentos: auth endpoints + GET  
    _Fonte:_ `server/middleware/02-csrf-validate.ts`, `server/utils/shared/csrf.ts`

13. **Lockout dual-tier** — (email+IP) 10 tentativas + global email 50 → 30min  
    _Fonte:_ `server/utils/shared/security.ts`, tabela `auth_security_state`

14. **Bootstrap de location** — criar empresa cria location "Matriz" e seta `default_location_id` do owner  
    _Fonte:_ `server/utils/auth/company/repository.ts:createCompanyWithOwner`, `.kiro/specs/company-location-bootstrap/design.md`

15. **Autorização owner-only** — criação de convite, CRUD de produtos/locations, soft delete de empresa exigem `role='owner'`  
    _Fonte:_ `server/utils/auth/company/authorization.ts:assertCompanyRole`

16. **Unique de mesa** — `(company_id, location_id, number)` — duas locations da mesma empresa podem ter mesa 1  
    _Fonte:_ `server/utils/schema/restaurant-table.ts`, constraint `restaurant_table_company_location_number_idx`

### A Confirmar (Sem Evidência no Código)

- **TTL de sessão por perfil** (ADR-004) — spec descreve TTL diferente para owner/cashier/waiter; código usa apenas `rememberMe` (24h/7d)
- **Total monetário server-side** — `line_total` é gerado no banco, mas `total_amount` é recalculado em JS com `Math.round` (deveria ser `SUM(line_total)` em SQL)
- **Autorização por papel em order** — qualquer membro pode `complete`/`cancel` order (deveria exigir papel específico)
- **Concorrência otimista** — transições de order/mesa/turno fazem SELECT+UPDATE sem condição de status (deveria ser UPDATE com WHERE status esperado)

## Arquitetura e Stack

- **Framework:** Nuxt 4 (Nitro server engine, rotas em `server/api`)
- **Auth:** Better Auth (email/password, verificação, reset)
- **Database:** PostgreSQL 16 (RLS para isolamento tenant+location)
- **ORM:** Drizzle (type-safe queries, migrations em `drizzle/*.sql`)
- **Validação:** Zod em todos os endpoints
- **Testes:** Vitest (49 spec files + 15 integration tests; integração roda com PostgreSQL real como role `merp_app`)
- **CI:** GitHub Actions (lint, typecheck, testes)
- **Deploy:** Docker Compose (dev), Dockerfile (prod)

### Migrations

- `0000_functions_and_roles.sql` — funções `round_half_up`, `get_tenant_id`, `get_location_id`, role `merp_app`
- `0001_baseline.sql` — schema completo (auth, company, order, restaurant, print), 386 linhas
- `0002_rls_policies_grants.sql` — RLS policies + grants, 327 linhas
- `0003_order_idempotency_fingerprint.sql` — adiciona coluna `idempotency_fingerprint` e índice único
- `0004_p03_p04_restaurant_kitchen.sql` — ajustes de P0.3/P0.4 (mesas, estações, kitchen ticket)

### Estrutura de Pastas (Vertical Slices)

```
server/
├─ api/                   # 89 handlers (7 auth, 2 health, 78 company-scoped, security.txt)
├─ middleware/            # 00-no-store, 01/02-csrf, auth (sessão+rate limit), tenant, pii-audit
├─ templates/print/       # .hbs de kitchen ticket e receipt
└─ utils/
   ├─ auth/               # identity, company, invite (repositórios por contexto)
   ├─ order/              # order repository
   ├─ restaurant/         # restaurant repository
   ├─ print/              # print repository
   ├─ schema/             # Drizzle tables por feature (19 arquivos)
   ├─ shared/             # errors, security, audit, background, purge, csrf, email, ip, hibp, validate, handler
   └─ db/                 # withTenant (RLS), tenant-context.ts
app/                      # apenas auth pages (login, register, verify, reset)
shared/
├─ auth.ts                # Better Auth singleton (TTL 24h / 7d)
└─ logger.ts
drizzle/                  # migrations (5 arquivos SQL + journal)
tests/                    # integration tests (15 arquivos)
```

## Como Rodar e Testar

```bash
# Setup inicial
cp .env.example .env
# edite .env: host "postgres" → "localhost" se Nuxt roda no host
docker compose up -d postgres
npm run db:migrate:full      # aplica 0000→0001→0002→0003→0004 + verify-rls.ts
npm run dev                  # → http://localhost:3000

# Testes
npm test                     # unit + integration (precisa PostgreSQL)
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:watch

# Qualidade
npm run check                # format:check + lint + typecheck + check:routes
npm run lint
npm run typecheck
npm run format

# Database
npx drizzle-kit generate --name <nome>  # nova migração
npx drizzle-kit studio                 # Drizzle Studio
npm run db:migrate:full                # migrar do zero + verificar RLS
```

## Roadmap Realista

### MVP Restante (desbloquear vertical de restaurante)

**P0.6 — FSM completa de order** (esforço: ~2 dias)

- Estados `preparing`, `ready`; transições `POST /orders/{id}/prepare`, `POST /orders/{id}/ready`
- UPDATE condicional (WHERE status esperado, retorna 409 se inválido)
- Vincular transições ao kitchen ticket (order preparing → ticket pending; ticket served → order ready)

**P0.7 — Dinheiro server-side** (esforço: ~1 dia)

- `total_amount = SUM(line_total)` em SQL (remover `Math.round` em JS)
- Migrar `quantity` para `numeric(12,3)` (spec)
- CHECKs: `quantity > 0`, `unit_price >= 0`, `total_amount >= 0`, `order_type IN (...)`, `status IN (...)`

**P0.8 — Print worker MVP** (esforço: ~3 dias)

- Worker em `server/utils/print/worker.ts` (polling de `print_job` com status `pending`)
- Driver ESC-POS básico (comandos de texto + corte)
- Renderer Handlebars (templates de `server/templates/print/*.hbs`)
- Retry (max 3 tentativas) + DLQ (dead letter queue para jobs com 3 falhas)
- Testes de integração (worker busca job, renderiza, marca como `completed`)

**P0.9 — Frontend shell** (esforço: ~4 dias)

- Layout pós-login (header, menu lateral, seletor de empresa/location)
- Dashboard (lista de mesas, contadores: mesas ocupadas, orders abertas, turno atual)
- Tela de salão (grid de mesas, status visual, abrir/fechar mesa)
- Tela de pedido (lista de itens, adicionar/remover item, enviar para cozinha, fechar conta)

### Pós-MVP (consolidação)

**P1.1 — Hardening de segurança** (esforço: ~2 dias)

- Autorização por papel (waiter pode criar order, cashier pode fechar, kitchen vê tickets)
- Rate limit em mutações operacionais (criar order, abrir mesa, etc.)
- Auditoria operacional (quem criou/completou order, quem abriu/fechou mesa)
- CHECK constraints restantes (status, tipos, valores monetários)

**P1.2 — Roles completos** (esforço: ~1 dia)

- Adicionar `manager`, `waiter`, `cashier`, `kitchen` (migração + enum)
- Endpoint `PATCH /members/{id}/role` (owner-only)
- Testes de autorização por papel

**P1.3 — Testes de integração de restaurant/print** (esforço: ~2 dias)

- Mesa↔order (abrir mesa cria order, fechar mesa completa order)
- Kitchen ticket (order preparing cria ticket, ticket served marca order ready)
- Print worker (criar job, worker busca, renderiza, marca completed)
- Matriz de RLS de restaurant/print (cross-tenant isolation)

**P1.4 — Frontend KDS e caixa** (esforço: ~3 dias)

- KDS (lista de tickets por estação, filtro por status, transições start/ready/serve)
- Caixa (abrir turno, fechar conta, visualizar orders do turno, fechar turno)
- Fila de impressão (lista de jobs, retry manual)

### Adiado/Descartado (não MVP)

**Delivery, retail, wholesale, quotation** — descartado para MVP; manter schema extensível mas não construir as 4 verticais agora. Justificativa: restaurante é o único vertical validado; as demais dependem de fluxos de pagamento, logística e integrações que não existem.

**Fiscal (NFC-e/SAT)** — adiado; bloqueador de produção no Brasil mas não do piloto interno. Spec clara: cupom operacional não fiscal no MVP; NFC-e/SAT ficam para fase posterior. Justificativa: schema de order/items precisa estar estável antes de adicionar fiscal.

**Pagamentos integrados (Pix, cartão)** — adiado; cashier shift aceita apenas dinheiro no MVP. Justificativa: integração de pagamento exige certificação, webhook, reconciliação; complexidade alta para MVP.

**2FA (ADR-010)** — adiado; explicitamente adiado no ADR. Justificativa: Better Auth suporta mas exige fluxo de TOTP/SMS; adiciona fricção ao piloto interno.

**TTL por perfil (ADR-004)** — adiado; spec existe mas código não implementa. Justificativa: regra operacional de logout no fim do turno cobre o caso de uso; TTL dinâmico adiciona complexidade sem ganho claro no piloto.

**ERP B2B (compras, estoque, fornecedores)** — descartado para MVP; foco exclusivo em operação de restaurante. Justificativa: restaurante é o vertical de entrada; ERP é fase 2.

## Divergências e Pendências

### Código vs Spec

1. **Order types** — spec pede 6 (`dine_in`, `takeout`, `delivery`, `retail_pos`, `wholesale`, `quotation`), código implementa 2. _Decisão:_ manter 2 no MVP, adicionar outras verticais pós-MVP.

2. **Order status** — spec pede FSM completa (`open`, `confirmed`, `preparing`, `ready`, `completed`, `cancelled`), código tem 3 (`open`, `completed`, `cancelled`). _Decisão:_ adicionar `preparing`, `ready` em P0.6.

3. **Total amount** — `line_total` gerado no banco com `round_half_up`, mas `total_amount` recalculado em JS. _Decisão:_ corrigir em P0.7 (SUM em SQL).

4. **Quantity precision** — spec pede `numeric(12,3)`, código usa `numeric(10,3)`. _Decisão:_ migrar em P0.7.

5. **Unique de mesa** — spec pede `(company_id, location_id, number)`, código implementa corretamente após P0.3.

6. **Kitchen ticket** — estava quebrado (inserção de `default` em FK NOT NULL), corrigido em P0.4. _Status:_ resolvido.

7. **Mesa↔order** — não havia vínculo, implementado em P0.5. _Status:_ resolvido.

### Spec vs Spec (Conflitos)

1. **Transições de order** — spec antiga (`specs/006-core-order`) pede `PATCH /orders/{id}/status` + 422; spec nova (`specs/000-foundation/rest-api.md` R4/R8) exige `POST /orders/{id}/{verbo}` + 409. _Decisão:_ código segue R4/R8 (mais recente); atualizar specs antigas.

2. **Cashier shift** — spec pede `expected_cash`, `actual_cash`, `register_id`; código usa `opening_float`, `closing_float`, `expected_amount`, `actual_amount`. _Decisão:_ a confirmar; código atual confia no cliente para valor esperado (inseguro).

### Código vs ADR

1. **TTL por perfil (ADR-004)** — ADR descreve TTL diferente por perfil; código usa apenas `rememberMe` (24h/7d). _Decisão:_ adiado para pós-MVP; regra operacional de logout cobre o caso de uso.

2. **Dinheiro (ADR-003)** — ADR pede `round_half_up` por linha + SUM no servidor; código gera `line_total` correto mas recalcula `total_amount` em JS. _Decisão:_ corrigir em P0.7.

### Bloqueios Técnicos

1. **Sem autorização por papel** — qualquer membro pode criar/completar/cancelar order, abrir/fechar mesa, etc. _Decisão:_ adicionar em P1.1 (hardening).

2. **Concorrência otimista** — transições fazem SELECT+UPDATE sem condição de status; duas requisições simultâneas podem transicionar duas vezes. _Decisão:_ corrigir em P0.6 (UPDATE condicional).

3. **Sem CHECK constraints** — tabelas não validam status/tipos/valores monetários no banco. _Decisão:_ adicionar em P0.7 (dinheiro) + P1.1 (hardening).

4. **Idempotência insegura** — replay de order dentro da transação chama `getById` sem passar `tx`, abrindo outra conexão. _Decisão:_ corrigir em P0.6.

5. **Cashier shift confia no cliente** — valor esperado e diferença calculados em JS, não derivados de orders/pagamentos. _Decisão:_ a confirmar; pode exigir refatoração do modelo de cashier.

### Documentação

1. **README desatualizado** — diz que só auth/company/invites existem; order/restaurant/print já implementados. _Status:_ README atualizado em commit `13ca9c9`, mas ainda não reflete P0.2–P0.5.

2. **TODO desatualizado** — lista location e produtos como pendentes; ambos implementados. _Status:_ TODO atualizado em commit `13ca9c9`, mas ainda não reflete P0.2–P0.5.

3. **Specs removidas do HEAD** — specs consolidadas (`000-foundation`, `006-core-order`, `007-restaurant`) foram removidas; decisões de produto estão compiladas neste arquivo (`PROJETO.md`); manter specs em `.kiro/specs` para histórico.

4. **CLAUDE.md incompleto** — regra "Código > docs" presente, mas falta apontar para `PROJETO.md` e registrar convenções reais. _Decisão:_ expandir em FASE 5.

## Decisões que Exigem Confirmação

1. **Cashier shift:** derivar `expected_amount` de orders/pagamentos ou confiar no input do cliente? (código atual confia no cliente; inseguro mas simples)

2. **Order FSM:** implementar FSM completa (6 estados) ou manter simplificada (4 estados: open, preparing, ready, completed/cancelled)? (roadmap assume simplificada)

3. **Vertical de delivery:** quando implementar? (roadmap adiou; depende de validação de mercado)

4. **TTL por perfil:** manter adiado ou implementar? (ADR-004 existe mas código não segue; roadmap adiou)

5. **Print worker:** polling ou pub/sub (ex: PostgreSQL NOTIFY/LISTEN)? (roadmap assume polling; mais simples)

---

_Última atualização: 2026-11-02 (branch `docs/reorganizacao`)_  
_Decisões de arquitetura: [`decisions.md`](decisions.md)_
