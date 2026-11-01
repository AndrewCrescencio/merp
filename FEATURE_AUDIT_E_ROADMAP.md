# Merp — Auditoria de Features e Roadmap

**Data:** 2026-10-27
**Branch:** `dev`
**Natureza:** auditoria somente leitura + relatório.
**Regra seguida:** apenas este arquivo foi criado; nenhum outro arquivo do repositório foi alterado.

---

## Como esta auditoria foi feita

Foram inspecionados, no HEAD:

- os 37 handlers HTTP (7 de auth, 2 de health, 27 company-scoped, 1 `security.txt`);
- os repositórios de auth/identity, company/membership, invite, order, restaurant e print;
- o schema Drizzle (`server/utils/schema/*.ts`) e a cadeia de migrações `drizzle/0000 → 0001 → 0002`;
- as policies/grants de RLS e os scripts `verify-rls.ts`, `check-db.ts`, `check-routes.ts`;
- os 49 arquivos `*.spec.ts` do server (mais `app/app.spec.ts`) e os 15 arquivos `*.test.ts` de integração;
- `CLAUDE.md`, `README.md`, `TODO.md`, `docs/decisions.md` e `package.json`;
- os documentos de governança e specs **removidos do HEAD**, lidos somente leitura a partir de:
  - tag `pre-reset-limpo` (specs consolidadas mais recentes e `specs/000-foundation/rest-api.md`);
  - tag `archive/pre-docs-cleanup-2026-10-04` (specs originais 006, 007 e restaurant);
  - commit `8862c56^` (docs/review e docs/07-reference).

**Limite importante:** não foi executado banco, migração ou suíte nesta auditoria. A comparação schema Drizzle ↔ migrações é estática. A cadeia `0002` foi construída a partir de um banco migrado com `db:migrate:full`, conforme o cabeçalho da própria migração, mas a verificação de runtime deve ser refeita no CI.

### Legenda

| Símbolo | Significado                                                                           |
| ------- | ------------------------------------------------------------------------------------- |
| ✅      | Implementado e coerente com a spec vigente (ou com decisão posterior que a substitui) |
| 🔶      | Parcialmente implementado; o que falta está explicitado                               |
| ❌      | Especificado, sem código de produção                                                  |

**Esforço:** **P** = até ~1 dia; **M** = ~2–4 dias; **G** = ~5 dias ou mais (inclui testes e migração).

### Achados que mudam a conversa

1. **Order, Restaurant e Print existem**, mas apenas parcialmente e com divergências relevantes. `README.md` e `TODO.md` estão desatualizados: dizem que só auth/company/invites existem e que Core Order seria a “primeira feature”.
2. **Bloqueio crítico de MVP:** criar empresa não cria `location` e não existe CRUD de locations. Todo write operacional (order, restaurant, print) exige `company_member.default_location_id` + uma linha real em `location`; uma empresa recém-criada recebe `400` em todos esses fluxos até alguém inserir location direto no banco.
3. **`createKitchenTicket` está quebrado em runtime:** insere `sql\`default\``em`order_item_id`e`station_id`, ambas `NOT NULL` sem default. O teste unitário mocka o insert e dá falsa confiança; não há teste de integração desse caminho.
4. **RLS é a parte mais madura do projeto:** 17 tabelas com `ENABLE + FORCE`, policies por operação, grants para `merp_app` com `NOBYPASSRLS`, matriz de RLS e canary. Os riscos residuais são outros: CHECK constraints ausentes, autorização por papel ausente nos contextos operacionais e tabelas globais de auth sem RLS.
5. **ADR-003 está refletido em parte:** colunas monetárias são `numeric(12,2)` e `order_item.line_total` é gerada com `round_half_up`; porém `total_amount` é calculado em JS com `Number`/`Math.round` e ignora o valor gerado pelo banco. Além disso, `quantity` está `numeric(10,3)`, não `numeric(12,3)`.
6. **O fluxo de restaurante não fecha:** abrir mesa não cria/vincula order; não há endpoint para adicionar itens a uma order existente; não há endpoint de status de kitchen ticket; não há KDS; e não há worker de impressão.

---

## 1. Implementado hoje, por contexto

### 1.1 Auth e identidade — ✅

**Handlers (7):**

| Rota                                        | O que faz                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register`                   | Registro com `consentTermsVersion`, validação Zod, rate limit IP/email, anti-enumeração (201 idêntico para e-mail já existente), piso de tempo |
| `POST /api/auth/login`                      | Login com `rememberMe`, lockout, rate limit, `email_not_verified` 403, conta desativada mascarada, encaminhamento de `Set-Cookie`              |
| `POST /api/auth/logout`                     | Revoga sessão e emite `session_invalidated`                                                                                                    |
| `POST /api/auth/email/verification`         | Solicita verificação de e-mail com resposta genérica                                                                                           |
| `POST /api/auth/email/verification/confirm` | Confirma token de verificação                                                                                                                  |
| `POST /api/auth/password/forgot`            | Inicia recuperação com resposta genérica e piso de tempo                                                                                       |
| `POST /api/auth/password/reset`             | Troca senha com token, deny-list de senhas comuns e invalidação de sessões                                                                     |

**Implementação:** Better Auth como dono do schema de auth, `server/utils/auth/identity/*`, middlewares de sessão/rate limit e `auth_event`. TTL de sessão: 24h sem `rememberMe`, 7d com `rememberMe` (`shared/auth.ts`). O ADR-004 previa TTL por perfil; o código atual mantém a regra operacional de logout no fim do turno, sem TTL por perfil.

**Também implementado no contexto de identidade:**

- `GET /api/v1/me` (perfil + empresas), `GET /api/v1/me/data-export` (LGPD), `POST /api/v1/me/deactivate`, `POST /api/v1/me/consents/withdraw`;
- listagem e aceite de convites em `/api/v1/me/invitations`;
- PII audit middleware para `/me` e `/export`;
- eventos de auth (`register`, `login`, `logout`, `session_expired`, `session_invalidated`, etc.).

**Lacunas relevantes:**

- 2FA está explicitamente adiado (ADR-010); não há lista/revogação de outras sessões;
- TTL por perfil (ADR-004) não implementado;
- `account`, `session`, `user`, `verification` e `auth_security_state` não têm RLS (são tabelas globais do Better Auth/antiabuso; ver §1.6);
- entrega de e-mail depende de configuração externa (Resend) e não foi exercitada nesta auditoria.

### 1.2 Empresa, membership e convites — 🔶

**Handlers:**

- `POST /api/v1/companies` — cria empresa + primeiro membro `owner` em uma transação (`createCompanyWithOwner`), com CNPJ validado e 409 em conflito;
- `GET /api/v1/companies?search=` — busca empresas do usuário (máx. 20, `LIKE` escapado);
- `PATCH /api/v1/companies/{companyId}` e `DELETE /api/v1/companies/{companyId}` — owner-only; delete é soft delete e purga memberships;
- `POST /api/v1/companies/{companyId}/invitations` — owner-only; token de 256 bits, somente hash SHA-256 persistido, TTL de 7 dias;
- `DELETE /api/v1/companies/{companyId}/members/{userId}` — owner remove membro; membro pode sair, exceto owner;
- `PATCH /api/v1/companies/{companyId}/members/{userId}/default-location` — owner-only; define a location padrão do membro;
- `GET /api/v1/me/invitations` e `POST /api/v1/me/invitations/accept` — aceite usa o e-mail da sessão, nunca o body; claim atômico e single-use.

**Pontos fortes:** o fluxo de convite é o mais completo do projeto; a autorização owner-only é aplicada com `assertCompanyRole`; o convite usa GUC `app.invite_token_hash` e a policy de RLS valida token, e-mail, expiração e `accepted_at`.

**Lacunas:**

- **não existe criação de location** nem vínculo automático de location padrão ao owner; isso bloqueia todo o resto (ver §2.6);
- não existe `GET /api/v1/companies/{companyId}` (detalhe) nem listagem de membros/roles;
- roles existentes são apenas `owner` e `member`; não há `manager`, `waiter`, `cashier`, `kitchen`;
- não há transferência de ownership nem alteração de role;
- não há envio de e-mail de convite: o token é devolvido na resposta da API;
- não há CRUD de locations, products, parties, tables ou stations.

### 1.3 Core Order — 🔶

**Handlers (5):**

- `POST /api/v1/companies/{companyId}/orders` — cria order com itens e satélite `dine_in` ou `takeout`;
- `GET /api/v1/companies/{companyId}/orders` — lista com `status`, `limit`, `offset`;
- `GET /api/v1/companies/{companyId}/orders/{orderId}` — detalhe com itens e satélite;
- `POST .../orders/{orderId}/cancel` e `POST .../orders/{orderId}/complete` — transições.

**Implementado de verdade:**

- schema `order` + `order_item` + `order_dine_in` + `order_takeout`;
- criação transacional com itens e satélite;
- idempotência por coluna `idempotency_key` com índice único `(company_id, idempotency_key)`;
- RLS location-scoped em todas as tabelas;
- FSM mínima `open → completed|cancelled`, com 409 para transição inválida (R8);
- testes unitários e de integração cross-tenant para create/get/complete/cancel/list.

**Divergências e defeitos:**

| Tema               | Spec vigente                                                                       | Código atual                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tipos              | 6 (`dine_in`, `takeout`, `delivery`, `retail_pos`, `wholesale`, `quotation`)       | 2 (`dine_in`, `takeout`)                                                                     |
| Status             | FSM completa (`open`, `confirmed`, `preparing`, `ready`, `completed`, `cancelled`) | 3 (`open`, `completed`, `cancelled`)                                                         |
| Satélites          | 6 tabelas                                                                          | 2 (`order_dine_in`, `order_takeout`)                                                         |
| Campos             | `currency`, `notes`, `closed_at`, `CHECK` de tipo/status                           | ausentes; `completed_at` no lugar de `closed_at`; sem CHECK                                  |
| Itens              | `quantity numeric(12,3)`, snapshots jsonb, `sort_order`                            | `quantity numeric(10,3)`, snapshots `text`, sem `sort_order`; `bom_snapshot` NOT NULL        |
| Idempotência       | header `Idempotency-Key` obrigatório                                               | `idempotencyKey` opcional no body                                                            |
| Total              | half-up por linha, somado no servidor                                              | `line_total` gerado no banco, mas `total_amount` recalculado em JS com `Number`/`Math.round` |
| Preço              | snapshot server-side do produto                                                    | `productName`, `unitPrice`, `taxSnapshot` vindos do cliente                                  |
| Itens incrementais | fluxo de mesa lança itens ao longo do atendimento                                  | não existe `POST /orders/{orderId}/items`; a order só aceita itens na criação                |

**Defeitos concretos:**

- **Idempotência insegura:** dentro da transação de `create`, ao encontrar a chave existente o repositório chama `this.getById(...)` **sem passar `tx`**, abrindo outra transação/conexão. Isso pode bloquear ou ler estado inconsistente e não implementa replay de resposta (o contrato pede devolver a resposta original).
- **Total divergente:** `order_item.line_total` é `GENERATED ALWAYS AS round_half_up(...)`; o repository ignora esse valor e soma `Math.round(...)` em JS. O total persistido pode divergir da soma das linhas em centavos.
- **Sem autorização por papel:** `complete`/`cancel` chamam `withTenant(companyId, null, null)`, e os handlers só verificam sessão/tenant. Qualquer membro pode cancelar ou completar qualquer order da empresa.
- **Sem concorrência otimista:** `complete`/`cancel` fazem SELECT e depois UPDATE sem condição de status; duas requisições simultâneas podem transicionar duas vezes.
- **Listagem N+1:** `list` enriquece cada order com queries separadas; não há cursor, filtro `order_type` ou `customer_id`.
- **Sem CHECK constraints** para `order_type`, `status`, `quantity > 0`, `unit_price >= 0`, `total_amount >= 0`.
- **Sem auditoria operacional** de criação/transição de order.

**Conflito de spec a resolver:** `specs/006-core-order` e o consolidado antigo pedem `PATCH /orders/{id}/status` e `422` para transição inválida; o `specs/000-foundation/rest-api.md` (R4/R8, mais recente, verificado em 2026-10-19) proíbe `PATCH /status` e exige `POST {recurso}/{id}/{verbo}` com `409`. O código segue R4/R8. O roadmap assume R4/R8 e recomenda atualizar as specs antigas.

### 1.4 Restaurant — 🔶

**Handlers (9):**

- `GET .../restaurant/tables` — lista mesas;
- `POST .../restaurant/tables/{tableId}/open` — abre mesa (status `available → occupied`);
- `POST .../restaurant/tables/{tableId}/close` — fecha mesa (`occupied → available`);
- `GET .../restaurant/kitchen-tickets` — lista tickets com filtro de status;
- `GET .../restaurant/cashier-shifts` — lista turnos;
- `GET .../restaurant/cashier-shifts/current` — turno aberto do usuário;
- `POST .../restaurant/cashier-shifts` — abre turno;
- `GET .../restaurant/cashier-shifts/{shiftId}` — detalhe;
- `POST .../restaurant/cashier-shifts/{shiftId}/close` — fecha turno.

**Implementado:**

- schema de `restaurant_table`, `kitchen_ticket`, `kitchen_station`, `cashier_shift`;
- FSM de kitchen ticket no repositório (`pending → in_progress → ready → served|cancelled`);
- guards de estado para mesa e turno;
- RLS location-scoped;
- testes unitários dos métodos do repositório.

**Bloqueios e divergências:**

1. **`createKitchenTicket` não funciona:** insere `orderItemId: sql\`default\``e`stationId: sql\`default\``em colunas`NOT NULL`sem default; ignora completamente`input.items`. Não há chamador de produção (só o teste unitário), portanto o KDS nunca recebe tickets.
2. **Não existe endpoint de status de kitchen ticket.** O método `updateKitchenTicketStatus` existe no repositório, mas nenhum handler o expõe. O spec mais recente reconhece “sem endpoint”; R4 exige `POST .../{ticketId}/{verbo}` (não `PATCH /status`).
3. **Não existe KDS display:** não há `GET .../kitchen/display` nem filtro por estação.
4. **Abrir mesa não cria nem vincula order:** `currentOrderId` é sempre gravado como `null`; não há order `dine_in` criada, e fechar mesa também não completa order.
5. **Não há CRUD de mesas nem de estações:** só é possível listar mesas; não há como criar/editar/desativar mesa ou estação por API. Sem isso, o fluxo não é inicializável.
6. **Não há vínculo `current_order_id` com FK:** o campo é `text` sem `references`.
7. **Unique de mesa está errado:** o schema tem `(company_id, number)`; a spec pede `(company_id, location_id, number)`. Duas lojas da mesma empresa não podem ter a mesa 1.
8. **FSM inalcançável:** o repositório tem `started_at/ready_at/served_at` ausentes no schema; o spec pede esses timestamps.
9. **Cashier shift divergente:** o schema usa `opening_float`, `closing_float`, `expected_amount`, `actual_amount`, `difference`; o spec pede `expected_cash`, `actual_cash`, `difference` gerada e `register_id`. O fechamento confia em `expectedAmount`/`actualAmount` enviados pelo cliente e calcula `difference` em JS; não deriva o esperado de orders/pagamentos.
10. **Concorrência:** abrir mesa e abrir turno fazem SELECT seguido de UPDATE sem condição; duas requisições simultâneas podem abrir a mesma mesa/turno. O unique de turno aberto por usuário não existe no banco.
11. **Sem autorização por papel:** qualquer membro pode abrir/fechar mesa, fechar turno de qualquer `shiftId` (o repositório busca só por company/id), etc.
12. **Teste unitário enganoso:** `createKitchenTicket` é testado com tx mockado; o teste passa mesmo com o INSERT inválido no banco real. Não há teste de integração de restaurant.

### 1.5 Print — 🔶

**Handlers (6):**

- `GET .../print/printers` e `POST .../print/printers`;
- `GET .../print/jobs`, `POST .../print/jobs`, `GET .../print/jobs/{jobId}`, `POST .../print/jobs/{jobId}/retry`.

**Implementado:**

- cadastro/listagem de impressoras;
- enfileiramento de job com payload JSON stringificado;
- seleção de impressora padrão por tipo;
- listagem/detalhe/retry de jobs;
- RLS location-scoped.

**Lacunas:**

- **não há worker:** `server/tasks/` não existe; os métodos `markJobPrinting/completeJob/failJob/getPendingJobs` foram removidos junto com o antigo `process-print-queue.ts`. O retry apenas volta o job para `pending`; nada o processa.
- **não há driver ESC/POS** nem envio TCP/USB/serial.
- **não há templates de produção:** existem `server/templates/print/kitchen-ticket.hbs` e `receipt.hbs`, mas nenhum código os referencia. O spec pede templates `.ts` por pack.
- **schema de printer divergente:** o spec pede `driver`, `connection` jsonb, `station_ids[]`, `is_active`; o schema tem `type`, `connection_type`, `connection_config` text, `is_default`, `status`. O POST aceita `driver`/`connection`/`stationIds`/`isActive`, mas:
  - converte `driver` em `type` (`escpos|star|epson → receipt`, `custom → kitchen`);
  - **descarta `stationIds`**;
  - grava `isActive` em `isDefault` (semântica errada).
- **schema de print_job divergente:** sem `content` (bytes ESC/POS), sem `kitchen_ticket_id`, sem `printed_at`; `order_id` é NOT NULL e impede jobs genéricos.
- **sem idempotência:** o POST de jobs não aceita `Idempotency-Key`.
- **sem validação de conexão:** `connectionConfig` aceita host/porta arbitrários; um worker futuro precisa de timeout, limite de bytes e política de rede/SSRF.
- **testes unitários apenas:** não há teste de worker, driver, renderer ou integração RLS de print.

### 1.6 Plataforma compartilhada, segurança e banco — ✅ com riscos residuais

**Middlewares:** `00-no-store`, `01-csrf-token`, `02-csrf-validate`, `auth`, `tenant`, `pii-audit`. O tenant middleware resolve `companyId` do path, valida membership e grava `event.context.tenant`; não-membro ou empresa inexistente → 404. CSRF é double-submit; auth tem rate limit por usuário; health live/ready e `.well-known/security.txt` são públicos.

**Banco e RLS:**

- `drizzle/0000_functions_and_roles.sql`: `round_half_up` e role `merp_app` (`NOBYPASSRLS`, sem senha).
- `drizzle/0001_baseline.sql`: 22 tabelas. Não há checagem de divergência de tabela/coluna contra o schema Drizzle na comparação estática; o conjunto bate.
- `drizzle/0002_rls_policies_grants.sql`: 17 tabelas com `ENABLE + FORCE`:
  `auth_event`, `cashier_shift`, `company`, `company_member`, `invite`, `kitchen_station`, `kitchen_ticket`, `location`, `order`, `order_dine_in`, `order_item`, `order_takeout`, `party`, `print_job`, `printer`, `product`, `restaurant_table`.
- Grants: `SELECT, INSERT, UPDATE, DELETE` em todas as tabelas e `USAGE, SELECT` em sequences para `merp_app`; default privileges para tabelas futuras.
- Guardas: `scripts/verify-rls.ts` falha se qualquer tabela com RLS não tiver FORCE; `scripts/check-db.ts` valida conexão pré-migração; `scripts/check-routes.ts` valida naming/tenant.
- Testes: `rls-matrix.test.ts` cobre a lista de tabelas com RLS; `00-rls-canary.test.ts` impede leitura cross-tenant; `app-role.test.ts` valida `NOBYPASSRLS`; `grants-parity.test.ts` valida grants; `tenant-isolation-concurrent.test.ts` exercita troca rápida de tenant; `location-scope.test.ts` cobre escopo location; `order-item.test.ts` cobre `round_half_up`.

**ADRs e aderência:**

| ADR                            | Estado no código | Observação                                                                                                                                                 |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-002 (location scope)       | ✅               | `withTenant` + policies `company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)`; `default_location_id` é a fonte |
| ADR-003 (money)                | 🔶               | `numeric(12,2)` e `line_total` gerada com `round_half_up`; `total_amount` em JS e `quantity` `10,3` divergem                                               |
| ADR-004 (TTL por perfil)       | 🔶               | 24h/7d implementado; TTL por perfil não; regra operacional de logout no turno                                                                              |
| ADR-005 (/api/v1)              | ✅               | Auth/health fora do prefixo por decisão; recursos de empresa sob `/api/v1/companies/{companyId}`                                                           |
| ADR-006 (UUID)                 | ✅               | PKs text com `gen_random_uuid()`                                                                                                                           |
| ADR-007 (testes como merp_app) | ✅               | Projeto de integração roda como `merp_app`; globalSetup migra como owner                                                                                   |
| ADR-008 (vertical slices)      | ✅               | `server/utils/<context>` + schema por feature                                                                                                              |
| ADR-010 (2FA)                  | ⏸️               | Adiado por decisão                                                                                                                                         |

**Riscos residuais de segurança/banco:**

- **Sem CHECK constraints** em enums de status/tipo, quantidades e valores monetários. O próprio `TODO.md` reconhece isso.
- **Tabelas globais de auth sem RLS:** `account`, `session`, `user`, `verification`, `auth_security_state`. As quatro primeiras são geridas pelo Better Auth e consultadas por identidade; `auth_security_state` guarda chaves globais de rate limit/lockout. Não são tenants, mas precisam de acesso restrito e revisão de vazamento de e-mail/PII.
- **Autenticação por papel ausente nos contextos operacionais:** orders, restaurant e print só verificam sessão + membership; não verificam `owner/manager/waiter/cashier/kitchen`.
- **Sem auditoria operacional:** `auth_event` cobre auth/PII, mas não há evento para order criada/transicionada, mesa aberta/fechada, ticket, turno ou impressão.
- **Sem rate limit nos endpoints operacionais:** o rate limit está concentrado em auth/register/company/invite; mutações de order/restaurant/print não têm limite.
- **Races:** mesa, turno e transições de order/ticket usam SELECT + UPDATE sem condição; idempotência de order abre transação aninhada.
- **Sem testes de integração de restaurant/print:** a cobertura RLS forte é de catálogo/auth; os contextos novos não têm matriz de RLS real.

### 1.7 Frontend — 🔶 (~5%)

Existem apenas:

- `app/app.vue` (3 linhas);
- `app/composables/useApiFetch.ts`;
- `app/middleware/auth.global.ts`;
- 5 páginas de auth: login, register, forget-password, reset-password, verify-email;
- `app/app.spec.ts`.

Não há shell pós-login, layout, seletor de empresa/location, dashboard, telas de mesa/pedido/KDS/caixa/impressão, stores ou componentes de domínio. O frontend atual não cobre nenhuma vertical operacional.

### 1.8 Testes e CI — ✅ no que cobre, 🔶 no que falta

- 49 `*.spec.ts` no server + 1 no app; 15 `*.test.ts` de integração.
- Projetos Vitest separados (unit vs integration); integração real com Postgres, globalSetup migra como owner e testes rodam como `merp_app`.
- CI: lint/format/check-routes, typecheck, Postgres 17, `db:migrate:full` como owner, suíte completa como `merp_app`.
- Cobertura forte: auth, company/membership/invites, middlewares, segurança, RLS, money function, tenant isolation.
- Cobertura fraca/ausente: restaurant e print integração; worker; criação real de kitchen ticket; idempotência de order; header `Idempotency-Key`; seis tipos de order; total monetário; autorização por papel; novos endpoints de setup.

### 1.9 Quadro-resumo

| Contexto                         | Status | Handler → Repository | RLS                           | Testes          | Maior lacuna                                             |
| -------------------------------- | ------ | -------------------- | ----------------------------- | --------------- | -------------------------------------------------------- |
| Auth/Identity                    | ✅     | Sim                  | Parcial (auth global sem RLS) | Forte           | TTL por perfil/2FA adiados                               |
| Company/Membership               | 🔶     | Sim                  | Sim                           | Forte           | Sem location, sem lista de membros/roles                 |
| Invites                          | ✅     | Sim                  | Sim                           | Forte           | E-mail de convite não enviado                            |
| Core Order                       | 🔶     | Sim                  | Sim                           | Parcial         | Só 2/6 tipos; FSM/Itens incrementais/idempotência/total  |
| Restaurant                       | 🔶     | Sim                  | Sim                           | Unitário apenas | Kitchen ticket quebrado; sem KDS; sem vínculo mesa↔order |
| Print                            | 🔶     | Sim                  | Sim                           | Unitário apenas | Sem worker/driver/templates/conteúdo                     |
| Frontend                         | 🔶     | —                    | —                             | Mínimo          | Só auth; nenhuma vertical                                |
| RLS/Infra                        | ✅     | —                    | 17 tabelas FORCE              | Forte           | CHECK constraints, roles, testes dos novos contextos     |
| Fiscal/Payments/outras verticais | ❌     | —                    | —                             | —               | Sem código                                               |

---

## 2. Especificado mas não implementado

### 2.1 Governança e fontes: o que existe no HEAD

| Documento                                                                      | Estado no HEAD             | Fonte usada nesta auditoria                              | Impacto                                                                                                              |
| ------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `constitution.md` / `.specify/memory/constitution.md`                          | Ausente (removido)         | Tag/commit histórico                                     | Exige interfaces de repositório e camadas que o `CLAUDE.md` atual rejeita; conflito de arquitetura                   |
| `plan.md`, `spec.md`, `architecture.md`, `api.md`, `failure.md`, `security.md` | Ausentes                   | Tags históricas                                          | Specs originais não estão versionadas no HEAD                                                                        |
| `specs/`                                                                       | Ausente                    | `pre-reset-limpo`, `archive/pre-docs-cleanup-2026-10-04` | 001 auth, 006 core-order, 007 print, packs restaurant/erp-b2b, ADRs                                                  |
| `docs/`                                                                        | Apenas `docs/decisions.md` | `8862c56^` para docs/review e docs/07-reference          | Reviews e referência operacional foram removidos                                                                     |
| `docs/decisions.md`                                                            | Presente                   | HEAD                                                     | Boa fonte dos ADRs; divergência: diz `quantity numeric(12,3)`, schema tem `10,3`                                     |
| `README.md`                                                                    | Presente                   | HEAD                                                     | Diz “apenas backend: auth, empresas, membros, convites, health” — desatualizado                                      |
| `TODO.md`                                                                      | Presente                   | HEAD                                                     | Diz que Core Order é a “primeira feature” e que `auth_event` não tem RLS — ambas as afirmações estão erradas no HEAD |

**Consequência:** o projeto não tem hoje uma fonte única de verdade. A implementação existe, mas as specs que a descrevem foram removidas do HEAD; qualquer decisão de produto precisa ser reconstruída a partir de tags/commits.

### 2.2 Classificação das specs

| Spec / área                                     | Status | O que existe                                                                         | O que falta                                                                                                        |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `001-auth-context`                              | ✅     | Registro, login, logout, verificação, reset, lockout, rate limit, LGPD, eventos      | TTL por perfil (ADR-004) e 2FA (ADR-010) adiados; lista/revogação de sessões                                       |
| `001` company/membership/invites                | 🔶     | Empresa, owner, convite por token, remoção de membro, default location               | CRUD de location, lista de membros, roles além de owner/member, transferência de ownership                         |
| `006-core-order` + consolidado §2               | 🔶     | `dine_in`/`takeout`, create/list/get/cancel/complete, itens, satélites, RLS          | 4 tipos, FSM completa, satélites, campos, idempotência por header, itens incrementais, total SQL, CHECKs           |
| `specs/packs/restaurant`                        | 🔶     | Tabelas, listagem de mesas/tickets/turnos, open/close mesa, cashier open/close       | CRUD de mesas/estações, criação real de ticket, status/KDS, vínculo mesa↔order, campos/timestamps, cashier correto |
| Print (consolidado §3 / 007)                    | 🔶     | CRUD de printers/jobs, retry, RLS                                                    | Worker, driver ESC/POS, templates, `content`, `station_ids`, idempotência, `printed_at`, testes                    |
| `000-foundation/rest-api` R1–R8                 | ✅     | Rotas `/api/v1`, tenant no path, POST para transição, 201+Location, 204, 404/409/403 | Novos endpoints precisam continuar obedecendo à guarda; decidir 409 vs 422                                         |
| `000-foundation/fiscal-br`                      | ❌     | Nenhum código fiscal                                                                 | NFC-e/SAT/NF-e, certificados, contingência, tabelas fiscais, retenção 5 anos                                       |
| ERP B2B (packs)                                 | ❌     | Apenas planos em specs                                                               | CRM, finance, sales, catalog, admin                                                                                |
| Frontend (docs/review/09)                       | 🔶     | 5 páginas de auth                                                                    | Todo o resto                                                                                                       |
| ADR-002 / ADR-005 / ADR-006 / ADR-007 / ADR-008 | ✅     | Implementados                                                                        | —                                                                                                                  |
| ADR-003                                         | 🔶     | `numeric(12,2)` + `round_half_up` por linha                                          | Total SQL, `quantity 12,3`, CHECKs                                                                                 |
| ADR-004                                         | 🔶     | 24h/7d                                                                               | TTL por perfil                                                                                                     |
| ADR-010                                         | ⏸️     | Adiado                                                                               | 2FA                                                                                                                |

### 2.3 Core Order: o que falta em detalhe

**Schema (`server/utils/schema/order.ts`, `order-item.ts`):**

- `order_type` aceita apenas `dine_in` e `takeout`; a spec pede 6 valores.
- `status` aceita apenas `open`, `completed`, `cancelled`; a spec pede FSM com `confirmed`, `preparing`, `ready`.
- faltam `currency` (default `BRL`), `notes`, `closed_at`; existe `completed_at`.
- faltam as tabelas satélites `order_delivery`, `order_retail_pos`, `order_wholesale`, `order_quotation`.
- não há CHECK constraints.
- `order_item.quantity` é `numeric(10,3)` (spec: `12,3`).
- `tax_snapshot` e `bom_snapshot` são `text` (spec: `jsonb`); `bom_snapshot` é NOT NULL (spec: nullable).
- falta `sort_order`.
- `line_total` gerada com `round_half_up` está correta, mas não é usada para o total.

**API/repositório (`server/utils/order/repository.ts`):**

- `Idempotency-Key` não é lido do header; o body tem `idempotencyKey` opcional.
- não há replay da resposta original; conflito de chave única vira 409, não devolve a order existente.
- a busca de idempotência abre transação aninhada sem `tx`.
- não existe endpoint para adicionar/remover itens de uma order aberta; isso inviabiliza o fluxo de mesa.
- `unitPrice`, `productName` e `taxSnapshot` vêm do cliente; não há lookup server-side nem proteção contra preço adulterado.
- `total_amount` é calculado em JS e persistido; a soma SQL das linhas pode divergir.
- `complete`/`cancel` usam `withTenant(companyId, null, null)`, sem `userId`; RLS fica em escopo company e qualquer membro pode agir.
- `list` é N+1, offset-based, sem filtro `order_type`/`customer_id`/`cursor`.
- não há evento de auditoria de order.

**Testes:**

- unitários cobrem create/get/complete/cancel/list e transições inválidas;
- integração cobre cross-tenant e FSM `open → completed|cancelled`;
- não cobrem idempotência (header/replay/concorrência), total monetário, seis tipos, satélites, autorização por papel, itens incrementais.

**Decisão recomendada:** para o MVP, manter **somente `dine_in` + `takeout`** e implementar o FSM necessário ao restaurante (`open → preparing → ready → completed`, com `cancelled`), deixando delivery/retail/wholesale/quotation para depois. O schema pode ficar extensível, mas não construir as 4 verticais agora. Atualizar as specs para refletir a decisão.

### 2.4 Restaurant: o que falta em detalhe

**Mesas (`restaurant_table`):**

- status atuais `available|occupied|reserved|closed` batem com a spec mais recente (`pre-reset`), embora a versão arquivada use `free|cleaning`; padronizar a versão vigente.
- unique `(company_id, number)` deveria ser `(company_id, location_id, number)`.
- `current_order_id` deveria ter FK para `order.id`.
- não há CRUD de mesa; só lista e open/close.
- open/close não criam/completam order e não usam condição de concorrência.

**Kitchen ticket:**

- schema tem `order_id`, `order_item_id`, `station_id`, status, priority; faltam `started_at`, `ready_at`, `served_at`.
- `createKitchenTicket` insere `default` nos FKs NOT NULL e ignora `input.items`; não há chamador.
- não há endpoint de status; o FSM do repositório é inalcançável.
- não há endpoint de display/KDS por estação.
- não há mapeamento item → estação (produto/station); a spec não define a tabela de roteamento, então isso precisa ser decidido.
- não há criação automática por trigger/evento ao lançar itens.
- status inválido: a spec antiga diz 422; R4/R8 dizem 409 e POST verb; decidir e padronizar.

**Cashier shift:**

- schema atual: `opening_float`, `closing_float`, `expected_amount`, `actual_amount`, `difference` (não gerada), status `open|closed|reconciled`.
- spec: `register_id`, `expected_cash`, `actual_cash`, `difference` GENERATED, status `open|reconciled|closed`.
- fechamento confia em `expectedAmount`/`actualAmount` do cliente e calcula a diferença em JS; não deriva o esperado de orders/pagamentos.
- não há vínculo com `pos_register` nem com pagamentos.
- concorrência: dois opens simultâneos podem criar dois turnos abertos para o mesmo usuário.

**Testes:**

- só unitários do repositório;
- `createKitchenTicket` passa com tx mockado, mas falharia no banco real;
- não há teste de integração de mesa, ticket, turno ou RLS location-scoped para restaurant.

### 2.5 Print: o que falta em detalhe

**Schema:**

- `printer` atual: `name`, `type`, `connection_type`, `connection_config` text, `is_default`, `status`, `last_seen_at`.
- spec: `driver` (`escpos|star|epson|custom`), `connection` jsonb, `station_ids uuid[]`, `is_active`.
- `print_job` atual: `order_id` NOT NULL, `template`, `payload` text, `priority`, status `pending|printing|completed|failed`, `attempts`, `max_attempts`, `last_error`, `started_at`, `completed_at`.
- spec: `content` (ESC/POS bytes), `kitchen_ticket_id`, `printed_at`; `order_id` não deveria ser obrigatório para todo job.
- não há índice/constraint de idempotência.

**Runtime:**

- não há `server/tasks/process-print-queue.ts`; o diretório `server/tasks/` não existe.
- não há driver ESC/POS, socket TCP, USB/serial, timeouts, retry/backoff, limite de bytes.
- não há templates `.ts`; os `.hbs` existem mas não são usados.
- retry só volta para `pending`; nada processa.
- não há idempotência no POST de jobs.
- não há worker por tenant; um worker global ingênuo pode violar RLS ou varrer tenants indevidamente (o antigo foi removido justamente por isso).

**Segurança:**

- `connection_config` aceita host/porta arbitrários; um worker que conecta nesses valores precisa de validação de rede, timeout e proteção contra SSRF/abuso.
- logs de impressão não devem conter payload com PII.
- o worker deve operar com tenant/location explícitos via `withTenant` ou uma fila global sem PII; nunca com role owner/BYPASSRLS.

### 2.6 Setup operacional: location, catálogo e party

**Location — ❌ (especificado e necessário, sem código de API):**

- `location` existe no schema e tem RLS, mas não há endpoint de CRUD nem criação automática.
- `createCompanyWithOwner` insere apenas `company` + `company_member`; não cria location e não define `default_location_id`.
- `requireLocationId` retorna 400 quando não há default location; todos os writes de order/restaurant/print usam esse helper.
- **Consequência:** uma empresa nova não consegue operar nenhuma vertical até uma location ser inserida manualmente no banco.
- **Nuance de RLS:** a policy de INSERT de `location` exige `company_id = get_tenant_id()` e `(id = get_location_id() OR get_location_id() IS NULL)`. Para criar uma location nova, o fluxo deve rodar com `app.location_id` NULL; se o owner já tiver default location, a criação de outra location pode ser negada. O bootstrap deve criar a primeira location antes de setar o default.
- **Valor:** desbloqueia order/restaurant/print e multi-loja; é o item P0.1 do roadmap.

**Product/menu — 🔶 (schema existe, sem endpoints):**

- `product` tem `name`, `sku`, `unit_price`, `tax_rule_id` (sem FK), `is_active`, company/location.
- não há CRUD; o order atual exige que o cliente envie nome/preço/snapshot, então o “menu” não é gerenciável.
- **Consequência:** o frontend não consegue montar um cardápio nem garantir preço server-side.

**Party — 🔶 (schema existe, sem endpoints):**

- `party` tem `type` customer/supplier, document, email, phone.
- não há CRUD; para dine-in/takeout o `customer_id`/`party_id` é opcional, então isso pode ficar para depois do MVP, mas delivery/wholesale vão precisar.

### 2.7 Frontend

- Só auth. Não há tela de seleção de empresa/location, setup, salão, pedido, KDS, caixa, fila de impressão ou relatórios.
- `useApiFetch` e `auth.global.ts` existem, mas não há shell pós-login.
- Para o MVP de restaurante, o frontend é um item **G** e depende de todos os endpoints P0/P1.
- Segurança: CSRF já é tratado no backend; o client precisa enviar `x-csrf-token`, não expor tokens e respeitar roles na UI (a autorização real fica no backend).

### 2.8 Fiscal, pagamentos e demais verticais

| Área                                      | Status | O que falta                                                                                                        |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| Pagamentos                                | ❌     | Tabela de pagamentos, métodos (dinheiro/PIX/cartão), idempotência, estorno, conciliação com cashier shift          |
| Fiscal BR                                 | ❌     | NFC-e/SAT/NF-e, certificado A1, SEFAZ, contingência offline, `fiscal_document`/itens/eventos, retenção 5 anos, RLS |
| Delivery                                  | ❌     | `order_delivery`, endereço, courier, ETA, taxa, FSM, notificações                                                  |
| Retail POS                                | ❌     | `order_retail_pos`, register, cashier, inventory, barcode, pagamentos                                              |
| Wholesale                                 | ❌     | `order_wholesale`, PO, payment terms, shipping address, price tables                                               |
| Quotation                                 | ❌     | `order_quotation`, validade, aprovação, conversão em order                                                         |
| ERP B2B (CRM/finance/sales/catalog/admin) | ❌     | Apenas planos; nenhum código                                                                                       |
| Inventory/BOM                             | ❌     | `stock_movement`, recipes/BOM, purchasing; necessário para retail/wholesale e custos                               |

**Fiscal é bloqueador de produção no Brasil**, mas não do piloto interno. A spec é clara: o print MVP é **cupom operacional não fiscal**; NFC-e/SAT ficam para fase posterior. Não começar fiscal antes de o schema de order/items estar estável.

### 2.9 Conflitos de spec que precisam de decisão

| Conflito                                                                 | Versões                                                    | Decisão recomendada                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Transição de order: `422` + `PATCH /status` vs `409` + `POST /verbo`     | 006/consolidado antigo vs `rest-api.md` R4/R8 (2026-10-19) | Adotar **R4/R8**: `POST .../{verbo}`, `409`; atualizar 006/consolidado              |
| Base path `/api/v1/orders` vs `/api/v1/companies/{companyId}/orders`     | 006 antigo vs R5/implementação                             | Adotar **company-scoped** (R5); reescrever contratos antigos                        |
| Status de mesa `free                                                     | cleaning`vs`available                                      | closed`                                                                             | archive vs pre-reset                 | Adotar **pre-reset** (`available | occupied | reserved  | closed`) |
| Status de print `queued                                                  | printed`vs`pending                                         | completed`                                                                          | archive 007 vs consolidado pre-reset | Adotar **pre-reset** (`pending   | printing | completed | failed`) |
| `quantity numeric(12,3)` vs `10,3`                                       | spec/ADR-003 vs schema                                     | Migrar para **12,3** e alinhar `docs/decisions.md`                                  |
| `total_amount` half-up SQL vs JS                                         | ADR-003 vs repository                                      | Usar **soma SQL de `line_total`**; remover cálculo JS                               |
| Constitution com interfaces de repositório vs CLAUDE “sem service layer” | constitution v2.4 vs CLAUDE atual                          | Manter **CLAUDE atual** (handler → repository → Drizzle) e atualizar a constitution |
| `Idempotency-Key` header obrigatório vs body opcional                    | spec 006 vs handler                                        | Adotar **header obrigatório**, body apenas alias temporário                         |
| 6 tipos de order vs MVP restaurante                                      | spec core vs estratégia vertical                           | **Duas fases:** MVP com `dine_in`/`takeout`; demais tipos depois                    |

---

## 3. Roadmap priorizado

### 3.1 Princípios

1. **Restaurante primeiro.** Nenhuma vertical de delivery, retail, wholesale, quotation ou ERP B2B antes de o fluxo “abrir mesa → lançar itens → KDS → fechar conta → imprimir → caixa” funcionar de ponta a ponta.
2. **Segurança primeiro, sempre.** Toda tabela nova entra com `ENABLE + FORCE RLS`, policies por operação, grants para `merp_app`, teste de matriz/cross-tenant e `verify-rls` no CI. Todo endpoint novo valida tenant + location + papel.
3. **Não construir o schema dos 6 tipos agora.** Manter `dine_in`/`takeout` no MVP e deixar o schema extensível; as 4 verticais restantes são P3.
4. **Não confiar no cliente para preço, total, expected cash ou status.** O servidor calcula e valida.
5. **Nenhum worker com owner/BYPASSRLS.** O worker de impressão deve operar por tenant com `withTenant` ou por uma fila global sem PII, com isolamento explícito.
6. **Resolver a dívida de documentação antes de acelerar.** Uma fonte de verdade para 409/422, tipos de order, rotas e quantidade.

### 3.2 P0 — Desbloquear o vertical de restaurante (MVP foundation)

#### P0.1 — Bootstrap de location + CRUD de locations

- **O que:** criar a primeira `location` na mesma transação de `createCompanyWithOwner`, definir `company_member.default_location_id` do owner e expor `GET/POST/PATCH/DELETE /api/v1/companies/{companyId}/locations` (com `isActive` em vez de delete físico). Incluir `GET /api/v1/companies/{companyId}` (detalhe) para o setup.
- **Por que:** hoje uma empresa nova não tem location, e todo write operacional retorna 400 em `requireLocationId`; sem isso, order/restaurant/print não são inicializáveis. Depende de RLS existente; risco de bloquear todo o MVP; valor altíssimo.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende da policy de `location` e do fluxo de bootstrap; bloqueia P0.2, P0.3, P0.4, P0.5, P1 e frontend.
- **RLS/segurança/fiscal:** criação deve rodar com `app.location_id` NULL (a policy de INSERT exige `id = get_location_id()` ou GUC NULL); mutações owner/manager; validar que a location pertence à empresa; adicionar testes de integração de location (CRUD + cross-tenant + cross-location). Sem impacto fiscal.
- **Aceite:** criar empresa → location “Matriz” existe, owner com `default_location_id` → `POST /orders` e `POST /restaurant/tables/{id}/open` deixam de retornar 400; não-owner recebe 403; location de outra empresa retorna 404.

#### P0.2 — CRUD mínimo de catálogo (produtos)

- **O que:** `GET/POST/PATCH/DELETE /api/v1/companies/{companyId}/products` com `name`, `sku`, `unitPrice`, `isActive`; listagem por location. Opcionalmente `categories`/`menu`, mas o mínimo é produto.
- **Por que:** orders exigem `productName`/`unitPrice`/snapshot; sem catálogo o frontend não tem cardápio e o servidor não consegue fazer snapshot de preço. Depende de location; risco de preço adulterado se o cliente continuar enviando; valor direto para o fluxo de pedido.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P0.1; bloqueia P1.5 (snapshot server-side) e o frontend de cardápio.
- **RLS/segurança/fiscal:** `product` já tem RLS; validar `unitPrice` como `numeric(12,2)` e `sku` único por empresa; owner/manager para mutações; `taxRuleId` sem FK deve ser decidido (não usar em MVP fiscal). Sem impacto fiscal imediato.
- **Aceite:** owner cria produto; garçom lista; order usa preço do banco, não do body; produto de outra empresa/location não aparece.

#### P0.3 — Setup de salão: mesas, estações, membros e roles

- **O que:** CRUD de `restaurant_table` (com unique `(company, location, number)` e `current_order_id` FK) e `kitchen_station`; `GET /api/v1/companies/{companyId}/members` com role/default location; definir o conjunto inicial de roles (`owner`, `manager`, `waiter`, `cashier`, `kitchen`).
- **Por que:** não há como criar mesas/estações por API e não há lista de membros; sem isso o restaurante não é configurável. Depende de location; risco de constraint errada impedir duas lojas; valor de setup.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P0.1; bloqueia P0.4 (tickets por estação), P0.5 e P1.8 (autorização).
- **RLS/segurança/fiscal:** novas constraints + migração; RLS já cobre as tabelas; validar que mesa/estação pertencem à location; owner/manager para mutações; member list owner/manager; sem impacto fiscal.
- **Aceite:** duas locations podem ter mesa 1; owner cria mesa/estação; waiter não pode criar; lista de membros mostra role/default location.

#### P0.4 — Kitchen ticket: criação real, roteamento e status

- **O que:** corrigir `createKitchenTicket` para receber `orderItemId` e `stationId`, criar um ticket por item/estação, persistir timestamps; definir roteamento item→estação (tabela de mapeamento produto→estação ou `stationId` no item); expor `POST .../kitchen-tickets/{ticketId}/start|ready|serve|cancel` (R4) e `GET .../kitchen-tickets?stationId=`/display; atualizar status com `WHERE status = esperado` para concorrência.
- **Por que:** o método atual falha em runtime e não tem chamador; sem ticket não há KDS. Depende de P0.2/P0.3 e das orders; risco de bloquear o coração do restaurante; valor central.
- **Esforço:** **M** (API + migração + testes); **G** se incluir UI de KDS.
- **Depende de / bloqueia:** depende de P0.2, P0.3, P0.5; bloqueia P1.7 (print de cozinha) e o frontend de KDS.
- **RLS/segurança/fiscal:** `kitchen_ticket` já tem RLS; validar `order_item`/`station` no mesmo tenant/location; roles kitchen/manager; status inválido → 409 (R4/R8) ou 422 se a decisão for outra; teste de integração real (não mock) para o INSERT. Sem impacto fiscal.
- **Aceite:** lançar item gera ticket na estação correta; KDS lista por estação; transições válidas funcionam; inválida retorna 409/422 acordado; concorrência não duplica transição.

#### P0.5 — Vínculo mesa ↔ order e itens incrementais

- **O que:** `openTable` cria uma order `dine_in` na mesma transação e grava `current_order_id`; `closeTable` completa/cancela a order e libera a mesa; adicionar `POST .../orders/{orderId}/items` e `DELETE .../orders/{orderId}/items/{itemId}` para lançar itens ao longo do atendimento; permitir order aberta sem itens.
- **Por que:** hoje `openTable` grava `currentOrderId = null` e não cria order; e não há como adicionar itens depois da criação — o fluxo de mesa não existe. Depende de P0.1/P0.3/P0.4; risco de duplicidade de order por mesa; valor direto no fluxo.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P0.1, P0.3, P0.4; bloqueia P1.1 (FSM), P1.6 (caixa) e frontend.
- **RLS/segurança/fiscal:** order/order_item já têm RLS; validar `tableId` da mesma location; usar UPDATE condicional/lock para impedir duas orders ativas na mesma mesa; autorização waiter/manager; sem impacto fiscal.
- **Aceite:** abrir mesa cria order e vincula; lançar dois itens atualiza total; fechar mesa completa order e libera; abrir a mesma mesa duas vezes em paralelo só permite uma.

### 3.3 P1 — Fechar o vertical de restaurante

#### P1.1 — FSM de order e transições concorrentes

- **O que:** implementar o FSM acordado (`open → preparing → ready → completed`, com `cancelled`; `confirmed` opcional/implícito), endpoints `POST .../{verbo}` e atualização condicional de status; mapear 409 (R4/R8) e documentar a decisão.
- **Por que:** hoje só existe `open → completed|cancelled`; o KDS e o fechamento de mesa precisam de estados intermediários. Depende de P0.5; risco de corrida e estados inválidos; valor de consistência operacional.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P0.5; bloqueia P1.6, P1.7 e frontend de pedido/KDS.
- **RLS/segurança/fiscal:** RLS existente; autorização por role; auditoria de transição; sem impacto fiscal.
- **Aceite:** transições válidas por verbo; inválida 409; duas requisições concorrentes não transicionam duas vezes; order não volta de estado terminal.

#### P1.2 — Contrato de idempotência

- **O que:** exigir `Idempotency-Key` no header de criação de order e de print job; persistir chave (hash) + status/body/Location; replay devolve a resposta original; mesma chave com payload diferente → 409; resolver a transação aninhada e o caso de unique violation concorrente. Remover/depreciar `idempotencyKey` do body.
- **Por que:** a spec exige header; o código atual aceita body opcional e não faz replay; risco de pedidos duplicados e 500 em corrida. Depende do schema de order; valor de confiabilidade.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P0.5/P1.1; bloqueia produção confiável e print idempotente.
- **RLS/segurança/fiscal:** chave escopada por company; não logar payload sensível; teste concorrente; sem impacto fiscal.
- **Aceite:** duas chamadas com a mesma chave retornam o mesmo recurso/resposta; payload diferente retorna 409; sem chave retorna 400; teste concorrente passa.

#### P1.3 — Correção monetária e CHECK constraints

- **O que:** migrar `quantity` para `numeric(12,3)`; calcular `total_amount` como `SUM(line_total)` no SQL após inserir os itens; remover `Number`/`Math.round` do total; adicionar CHECKs de `quantity > 0`, `unit_price >= 0`, `total_amount >= 0`, `discount_applied >= 0` e enums de status/tipo (na medida do MVP).
- **Por que:** ADR-003; o total atual pode divergir da soma das linhas e o schema aceita valores inválidos. Depende da migração; risco de dados fiscais errados; valor de integridade.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P1.1; bloqueia fiscal e relatórios; pode rodar em paralelo com P1.2.
- **RLS/segurança/fiscal:** migração aditiva/backfill; CHECKs não afetam RLS; prepara o terreno para fiscal; sem impacto fiscal imediato.
- **Aceite:** total persistido = soma SQL das linhas; testes com 0,005 e quantidade fracionada; CHECKs rejeitam valores inválidos.

#### P1.4 — Alinhamento de schema do restaurante/print

- **O que:** adicionar `started_at/ready_at/served_at` em tickets; `register_id`, `expected_cash`, `actual_cash`, `difference` gerada em cashier; `driver`, `connection` jsonb, `station_ids`, `is_active` em printer; `content`, `kitchen_ticket_id`, `printed_at` em print_job; `currency`, `notes`, `closed_at`, `sort_order`, snapshots jsonb em order/order_item (somente o que o MVP usa).
- **Por que:** há divergência entre schema e spec em quase todas as tabelas do vertical; sem alinhar, o frontend e o worker codificam contra campos que não existem. Depende de P0/P1; risco de migrações conflitantes; valor de contrato estável.
- **Esforço:** **M/G** (fatiar por tabela).
- **Depende de / bloqueia:** depende de P0.3/P0.4; bloqueia P1.6/P1.7 e o frontend.
- **RLS/segurança/fiscal:** novas colunas não mudam policies; novas tabelas (se houver) exigem RLS/grants; migração aditiva com backfill; sem impacto fiscal.
- **Aceite:** schema Drizzle e migração batem com o contrato acordado; `docs/decisions.md` atualizado; nenhuma coluna “fantasma”.

#### P1.5 — Snapshot de preço, itens e paginação de orders

- **O que:** no create/add item, buscar product no servidor e gravar `productName`, `unitPrice`, `taxSnapshot`; recalcular `lineTotal`; expor filtros `order_type`/`customer_id` e paginação por cursor/keyset; eliminar N+1 com join/`inArray`.
- **Por que:** hoje o cliente controla preço e a listagem é N+1/offset; risco de fraude e performance. Depende de P0.2/P1.3; valor de segurança e escala.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P0.2, P1.3; bloqueia frontend de cardápio e relatórios.
- **RLS/segurança/fiscal:** validar product no tenant/location; preço server-side; snapshots imutáveis; sem impacto fiscal.
- **Aceite:** body não consegue alterar preço; total confere; lista não faz N+1; filtros/paginação documentados.

#### P1.6 — Cashier shift e pagamento manual

- **O que:** alinhar campos (`register_id` opcional, `expected_cash`, `actual_cash`, `difference` gerada), calcular expected a partir de orders/pagamentos em dinheiro, registrar método de pagamento manual (dinheiro/PIX/cartão) e impedir dois turnos abertos por usuário; status `open|reconciled|closed`.
- **Por que:** o fechamento atual confia em valores do cliente e não há como reconciliar; sem isso o caixa é apenas um registro manual. Depende de P1.1/P1.4; risco de fraude/erro; valor operacional.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P1.1/P1.4; bloqueia fiscal/pagamentos integrados e o frontend de caixa.
- **RLS/segurança/fiscal:** role cashier; `withTenant` com location; diferença gerada no banco; auditoria de abertura/fechamento; pagamento manual é não fiscal.
- **Aceite:** abrir turno; registrar pagamentos; fechar com diferença calculada; dois opens simultâneos → 409; valores negativos rejeitados.

#### P1.7 — Print MVP de verdade

- **O que:** alinhar printer/print_job; renderizar templates `.ts` de cozinha e cupom; gerar bytes ESC/POS; implementar worker Nitro a cada 30s com retry/backoff, timeouts e `withTenant` (ou fila global sem PII); TCP primeiro, USB/serial depois; idempotência por `Idempotency-Key`; status `pending|printing|completed|failed` e `printed_at`.
- **Por que:** hoje não há impressão alguma; o vertical de restaurante não opera sem cupom/cozinha. Depende de P0.4/P1.1/P1.4; risco alto de segurança no worker (cross-tenant/SSRF); valor direto.
- **Esforço:** **G**.
- **Depende de / bloqueia:** depende de P0.4, P1.1, P1.4; bloqueia frontend de fila e operação real.
- **RLS/segurança/fiscal:** worker nunca com owner/BYPASSRLS; validar host/porta, timeout e limite de bytes; logs sem PII; cupom **não fiscal**; testes com servidor TCP fake e teste de isolamento de tenant.
- **Aceite:** job enfileirado vira `completed` com bytes enviados; falha incrementa attempts e vira `failed` após 3; retry manual funciona; worker não vê jobs de outro tenant; cupom de cozinha e cupom de mesa renderizam.

#### P1.8 — Autorização por papel, auditoria e rate limit

- **O que:** expandir roles (`owner`, `manager`, `waiter`, `cashier`, `kitchen`), aplicar matriz de autorização em orders/restaurant/print, registrar eventos operacionais (order, mesa, ticket, turno, print) e aplicar rate limit nas mutações.
- **Por que:** hoje qualquer membro pode cancelar order, abrir mesa, fechar turno e registrar impressora; não há trilha operacional. Depende de P0.3/P1.4; risco de fraude; valor de segurança.
- **Esforço:** **M**.
- **Depende de / bloqueia:** depende de P0.3; pode rodar em paralelo; bloqueia produção multioperador.
- **RLS/segurança/fiscal:** RLS continua como backstop; roles são app-level; decidir tabela de auditoria operacional (ou estender `auth_event` com policy de leitura por role); sem impacto fiscal.
- **Aceite:** waiter não cancela order de outro; cashier não cria produto; kitchen não fecha caixa; toda mutação crítica gera evento; rate limit responde 429.

### 3.4 P2 — Frontend, hardening e operação

#### P2.1 — Frontend do vertical de restaurante

- **O que:** shell pós-login, seletor empresa/location, setup (locations, produtos, mesas, estações, impressoras, membros), salão, pedido, KDS, caixa e fila de impressão; layout para tablet; tratamento de CSRF/erros.
- **Por que:** o frontend atual só tem auth; sem telas o vertical não é usável. Depende de P0/P1 completos; risco de retrabalho se os contratos mudarem; valor de entrega.
- **Esforço:** **G**.
- **Depende de / bloqueia:** depende de P0.1–P0.5 e P1.1–P1.8; bloqueia piloto com usuários reais.
- **RLS/segurança/fiscal:** autorização real no backend; UI esconde ações por role, mas não é a única barreira; não expor tokens; testar fluxo no browser (golden path + erros).
- **Aceite:** um waiter consegue abrir mesa, lançar itens, ver KDS e fechar; cashier abre/fecha turno; owner configura o restaurante; fluxo testado em navegador.

#### P2.2 — Observabilidade do worker/impressão

- **O que:** métricas de fila, latência, falhas, tentativas; logs estruturados com tenant/location; health do worker; alertas de fila parada.
- **Por que:** impressão é operacional; sem visibilidade, falhas silenciosas param a cozinha. Depende de P1.7; esforço **P/M**.
- **RLS/segurança/fiscal:** logs sem payload/PII; worker health não expõe tenant; sem impacto fiscal.
- **Aceite:** dashboard/consulta mostra fila e falhas; alerta dispara com fila > limite; logs permitem rastrear job por id.

#### P2.3 — CHECK constraints e integridade

- **O que:** enums de status/tipo, `quantity > 0`, `unit_price >= 0`, `total_amount >= 0`, `discount_applied >= 0`, `capacity > 0`, `number > 0`, valores de shift >= 0, tipos de printer/conexão.
- **Por que:** o banco aceita estados inválidos; CHECKs são a última barreira. Depende de P1.3/P1.4; esforço **M**.
- **RLS/segurança/fiscal:** migração com backfill; CHECKs não substituem RLS; prepara fiscal.
- **Aceite:** inserts inválidos falham; suíte de integração cobre cada constraint; nenhum dado válido é rejeitado.

#### P2.4 — Suíte de RLS/segurança dos novos contextos

- **O que:** testes de integração para location, product, restaurant_table, kitchen_station, kitchen_ticket, printer, print_job, cashier_shift; cross-tenant e cross-location; grants parity; worker; matriz de roles; teste real de `createKitchenTicket`.
- **Por que:** a cobertura RLS atual é forte em catálogo/auth, mas os contextos novos têm só unitários; o teste de kitchen ticket dá falsa confiança. Depende de P0/P1; esforço **M**.
- **RLS/segurança/fiscal:** roda como `merp_app`, nunca owner; `verify-rls` no CI; sem impacto fiscal.
- **Aceite:** qualquer tabela nova com RLS está na matriz; cross-tenant falha; CI bloqueia merge se faltar FORCE/policy/teste.

#### P2.5 — Revisão das tabelas globais de auth

- **O que:** documentar o modelo de ameaça de `account`, `session`, `user`, `verification`, `auth_security_state`; restringir acesso por repositório/role; avaliar views/RLS ou justificar ausência; testar que nenhum endpoint lê user/session sem escopo de usuário.
- **Por que:** são tabelas globais sem RLS; `auth_security_state` guarda chaves de e-mail/IP e pode expor PII se consultada indevidamente. Esforço **M**.
- **RLS/segurança/fiscal:** decisão de segurança; não afeta fiscal.
- **Aceite:** documento de decisão; testes de acesso; nenhuma rota cruza dados de usuários.

#### P2.6 — Reset de documentação e decisões

- **O que:** restaurar/reescrever `specs/` e `docs/` no HEAD; atualizar `README`/`TODO`; registrar as decisões de 409 vs 422, 2 vs 6 tipos, rotas company-scoped, `quantity 12,3`, roles e escopo do MVP.
- **Por que:** hoje as specs foram removidas e o README/TODO contradizem o código; isso causa retrabalho. Esforço **P**.
- **Aceite:** uma fonte de verdade; links para ADRs; README reflete o que existe; TODO reflete o que falta.

#### P2.7 — Guardas de CI para os novos endpoints

- **O que:** garantir `check-routes` para locations/products/tables/stations/tickets/print; `stale-api-urls`; migração + `verify-rls`; suíte de integração como `merp_app`; teste do worker.
- **Por que:** novos endpoints podem violar R1–R8 sem guarda; esforço **P**.
- **Aceite:** CI falha em rota sem tenant/param errado, tabela sem FORCE, teste de RLS quebrado.

### 3.5 P3 — Pós-MVP (outras verticais e fiscal)

| Item                   | O que / por que                                                                                                               | Esforço | Dependências e bloqueios                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| **P3.1 Pagamentos**    | Tabela de pagamentos, métodos, idempotência, estorno, conciliação com cashier; sem isso o caixa é manual e o fiscal não fecha | **G**   | Depende de P1.6; bloqueia fiscal e retail; RLS por company/location; PCI/segurança se cartão                    |
| **P3.2 Fiscal BR**     | NFC-e/SAT/NF-e, certificado A1, SEFAZ, contingência, `fiscal_document`/itens/eventos, retenção 5 anos, RLS                    | **G**   | Depende de order/items/payments estáveis; bloqueado por certificado/homologação/legal; não iniciar antes do MVP |
| **P3.3 Delivery**      | `order_delivery`, endereço, courier, ETA, taxa, FSM, notificações                                                             | **G**   | Depende de order FSM/pagamentos; RLS location; fiscal se emitir documento                                       |
| **P3.4 Retail POS**    | `order_retail_pos`, register, cashier, barcode, inventory, pagamentos                                                         | **G**   | Depende de catálogo/inventory/pagamentos; RLS; fiscal NFC-e                                                     |
| **P3.5 Wholesale**     | `order_wholesale`, PO, payment terms, shipping, price tables                                                                  | **G**   | Depende de party/catalog/finance; RLS; NF-e                                                                     |
| **P3.6 Quotation**     | `order_quotation`, validade, aprovação, conversão em order                                                                    | **G**   | Depende de party/catalog; RLS; sem fiscal até converter                                                         |
| **P3.7 ERP B2B**       | CRM, finance, sales, catalog, admin (planos existentes)                                                                       | **G**   | Depende de toda a base; só depois do restaurante                                                                |
| **P3.8 Inventory/BOM** | `stock_movement`, recipes/BOM, purchasing, custos                                                                             | **G**   | Necessário para retail/wholesale; depende de catálogo; RLS                                                      |

### 3.6 Sequência recomendada

```text
M0 — desbloquear (1–2 semanas)
  P0.1 Location/bootstrap
    ├─ P0.2 Catálogo
    ├─ P0.3 Mesas/estações/membros
    └─ P0.5 Mesa ↔ order + itens incrementais
  P0.4 Kitchen ticket (em paralelo, após P0.3)
  P1.2 Idempotência e P1.3 Money (em paralelo)

M1 — fechar o vertical (2–4 semanas)
  P1.1 FSM
    ├─ P1.5 Snapshot/paginação
    ├─ P1.6 Cashier/pagamento manual
    └─ P1.7 Print MVP (G)
  P1.4 Schema alignment
  P1.8 Roles/auditoria (contínuo)
  P2.3 CHECKs e P2.4 RLS tests (contínuo)

M2 — operação real
  P2.1 Frontend do restaurante (G)
  P2.2 Observabilidade
  P2.5 Auth global review
  P2.6/P2.7 Docs/CI

M3 — expansão
  P3.1 Pagamentos → P3.2 Fiscal → P3.3 Delivery → P3.4 Retail → P3.5/P3.6 → P3.7/P3.8
```

### 3.7 Grafo de dependências

```text
Location ──> Catalog ──> Order/Items ──> Kitchen tickets ──> KDS
   │             │              │                  │
   ├──> Tables ──┘              ├──> Cashier ──> Payments ──> Fiscal
   │                            └──> Print jobs ──> Worker
   └──> Members/Roles ──────────────────────────────> Authz/Audit
RLS + CHECKs + tests cross-cut all milestones.
```

### 3.8 Riscos principais

| Risco                                        | Probabilidade | Impacto            | Mitigação                                          |
| -------------------------------------------- | ------------- | ------------------ | -------------------------------------------------- |
| Empresa sem location bloqueia todo write     | Certa         | Bloqueador         | P0.1 primeiro; teste de bootstrap                  |
| `createKitchenTicket` falha no banco real    | Certa         | Bloqueador         | Corrigir + teste de integração real                |
| Duas aberturas de mesa/turno simultâneas     | Alta          | Duplicidade/erro   | UPDATE condicional/lock; unique parcial            |
| Idempotência abre transação aninhada         | Alta          | 500/duplicidade    | Reestruturar com `tx`; teste concorrente           |
| Total em JS diverge do `line_total`          | Alta          | Valores errados    | Soma SQL; CHECKs; testes                           |
| Qualquer membro muta orders/restaurant/print | Alta          | Fraude             | Roles + auditoria + rate limit                     |
| Worker de print vaza tenants ou faz SSRF     | Média         | Vazamento/abuso    | Worker por tenant; validação de host/porta/timeout |
| Tabelas globais de auth sem RLS              | Média         | Vazamento de PII   | Revisão P2.5; acesso restrito                      |
| Specs conflitantes (409/422, tipos, rotas)   | Certa         | Retrabalho         | P2.6; uma fonte de verdade                         |
| Fiscal atrasa lançamento                     | Média         | Bloqueio comercial | Iniciar P3.2 cedo se obrigatório; MVP não fiscal   |

### 3.9 Definição de pronto do MVP de restaurante

- Empresa nova cria location padrão e owner com `default_location_id`; owner configura produtos, mesas, estações, impressoras e membros.
- Waiter abre mesa, lança itens ao longo do atendimento, order tem total correto e snapshot de preço; KDS recebe tickets por estação.
- Kitchen avança tickets; waiter/manager fecha a conta; mesa é liberada; order completa.
- Cashier abre turno, registra pagamento manual, fecha com diferença calculada.
- Cupom de cozinha e cupom de mesa imprimem via worker, com retry e isolamento de tenant.
- Todas as tabelas novas têm RLS+FORCE+policies+grants e testes cross-tenant/cross-location; CI roda como `merp_app`.
- Roles aplicados; eventos operacionais auditados; CHECKs ativos; rate limit nas mutações.
- Frontend cobre o fluxo em tablet e foi testado no navegador (golden path + erros).
- Fora do MVP: fiscal, delivery, retail, wholesale, quotation, inventory, ERP B2B.

### 3.10 O que não fazer agora

- **Não implementar os 6 tipos de order nem as 4 tabelas satélites** antes do fluxo de restaurante fechar.
- **Não construir fiscal/pagamentos integrados** antes de order/items/payments manuais estarem estáveis.
- **Não criar worker de impressão com role owner/BYPASSRLS** nem varrer `company` sem GUC.
- **Não aceitar preço/total/expected cash do cliente** como fonte de verdade.
- **Não criar endpoints novos sem RLS/FORCE/policies/grants e testes de isolamento** no mesmo PR.
- **Não investir no frontend completo** antes de os contratos P0/P1 estarem congelados; o retrabalho seria grande.
- **Não tratar o TODO/README como verdade** até o reset de documentação (P2.6).

---

## Referências principais

- Código: `server/api/**`, `server/utils/**`, `server/middleware/**`, `server/utils/schema/*.ts`, `server/templates/print/*.hbs`, `app/**`.
- Banco: `drizzle/0000_functions_and_roles.sql`, `drizzle/0001_baseline.sql`, `drizzle/0002_rls_policies_grants.sql`.
- Guardas: `scripts/verify-rls.ts`, `scripts/check-db.ts`, `scripts/check-routes.ts`.
- Testes: `server/utils/*.test.ts`, `server/**/*.spec.ts`, `app/app.spec.ts`.
- Documentos atuais: `CLAUDE.md`, `README.md`, `TODO.md`, `docs/decisions.md`, `package.json`.
- Specs históricas: `pre-reset-limpo:specs/consolidated-specs.md`, `pre-reset-limpo:specs/000-foundation/rest-api.md`, `pre-reset-limpo:specs/packs/restaurant/spec.md`, `archive/pre-docs-cleanup-2026-10-04:specs/006-core-order/*`, `archive/pre-docs-cleanup-2026-10-04:specs/007-print/*`, `8862c56^:docs/review/*`.
