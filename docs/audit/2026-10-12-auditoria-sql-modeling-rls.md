# AUD-001 — Auditoria SQL/Modelagem/RLS (verificação em runtime)

- **Data**: 2026-10-12
- **Branch**: `fix/sql-modeling-rls-audit` (base `db5fb5a` + migração `drizzle/0025_force_rls_fixes.sql`)
- **Continua**: `AUD-000-2026-09-22-revisao-specs-001-007-rls.md` — fecha os itens ⏸️ daquele relatório com execução em runtime (Docker local)
- **Escopo**: catálogo PostgreSQL real, colaterais do `FORCE RLS`, qualidade dos testes de isolamento, drift Drizzle, pendências, higiene de docs
- **Ambiente**: `merp-pg` (PG16, volume `merp_pgdata`, porta 5432) e `merp-pg17-audit` (PG17, porta 5433, DB descartável `merp_audit`) — ambos locais

---

## 1. Estado real vs. estado declarado

| Afirmação (fonte)                                                                                   | Estado real (catálogo, verificado)                                                                     | Divergência                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| AUD-000: "nenhum `ENABLE RLS` além dos 4"                                                           | **16 tabelas** com RLS + `FORCE` em `public`                                                           | ⚠️ O recorte do AUD-000 era `drizzle/0005–0019`; as 0020–0025 levaram a 16 tabelas. AUD-000 ficou desatualizado |
| AUD-000 item 6: "testes **não** rodam como `merp_app`"                                              | `vitest.config.ts:20-21` seta `DATABASE_URL=merp` **e** `APP_DATABASE_URL=merp_app`; ADR-007 normatiza | ✅ Ressalva resolvida (pós-AUD-000). Verificado: `test.env` sobrescreve env do CI, suíte corre como `merp_app`  |
| `docs/00-overview/architecture-overview.md`: policy `FOR ALL USING (company_id = current_tenant())` | Não existe `current_tenant()`; policies são **por operação** com `get_tenant_id()`/`get_location_id()` | ❌ Doc corrigido neste relatório (commit `d37377a`)                                                             |
| `docs/07-reference/database-schema.md`: `auth_event` = "Company-only", sem menção a FORCE           | `auth_event` **não tem RLS**; as 16 tabelas têm FORCE                                                  | ❌ Doc corrigido neste relatório (commit `d37377a`)                                                             |
| AUD-000: tabela `two_factor` user-scoped com RLS                                                    | Dropada (`drizzle/0021_drop_two_factor.sql`); virou coluna `user.two_factor_enabled`                   | ✅ "Landmine 2FA×RLS" do AUD-000 resolvida                                                                      |
| AUD-000: "0017 sem `ALTER DEFAULT PRIVILEGES`"                                                      | `drizzle/0020_app_role_default_privileges.sql` adiciona default privileges para `merp_app`             | ✅ Resolvido (pós-AUD-000)                                                                                      |

**Números do catálogo** (migrações completas do zero em `merp_audit`: `db:migrate:full` → 856 statements ✔):

- 23 tabelas em `public` — **16 com RLS + FORCE**, 7 sem RLS (`account`, `auth_event`, `auth_security_state`, `email_queue`, `session`, `user`, `verification`)
- 65 policies (todas `TO merp_app`)
- 0 tabelas com coluna `company_id` sem RLS
- 5 funções em `public`, **nenhuma `SECURITY DEFINER`**, todas sem `search_path` fixo problemático
- 0 views / matviews / triggers; 1 extensão (`plpgsql`)

### Matriz RLS real (catálogo — `merp_audit` pós-migração)

| Tabela                                                                                           | RLS | FORCE | Policies (nome → operação)                                                                             |
| ------------------------------------------------------------------------------------------------ | --- | ----- | ------------------------------------------------------------------------------------------------------ |
| `cashier_shift`                                                                                  | t   | t     | `cashier_shift_{select,insert,update,delete}_policy`                                                   |
| `company`                                                                                        | t   | t     | `company_select_policy`, `company_insert_policy`, `company_modify_policy` (w), `company_delete_policy` |
| `company_member`                                                                                 | t   | t     | `cm_{select,insert,update,delete}_policy`                                                              |
| `invite`                                                                                         | t   | t     | `invite_{select,insert,update,delete}_policy` + `invite_token_select_policy`                           |
| `kitchen_station`                                                                                | t   | t     | `kitchen_station_{select,insert,update,delete}_policy`                                                 |
| `kitchen_ticket`                                                                                 | t   | t     | `kitchen_ticket_{select,insert,update,delete}_policy`                                                  |
| `location`                                                                                       | t   | t     | `location_{select,insert,update,delete}_policy`                                                        |
| `order`                                                                                          | t   | t     | `order_{select,insert,update,delete}_policy`                                                           |
| `order_dine_in`                                                                                  | t   | t     | `order_dine_in_{select,insert,update,delete}_policy` (via `order`)                                     |
| `order_item`                                                                                     | t   | t     | `order_item_{select,insert,update,delete}_policy`                                                      |
| `order_takeout`                                                                                  | t   | t     | `order_takeout_{select,insert,update,delete}_policy` (via `order`)                                     |
| `party`                                                                                          | t   | t     | `party_{select,insert,update,delete}_policy`                                                           |
| `print_job`                                                                                      | t   | t     | `print_job_{select,insert,update,delete}_policy`                                                       |
| `printer`                                                                                        | t   | t     | `printer_{select,insert,update,delete}_policy`                                                         |
| `product`                                                                                        | t   | t     | `product_{select,insert,update,delete}_policy`                                                         |
| `restaurant_table`                                                                               | t   | t     | `restaurant_table_{select,insert,update,delete}_policy`                                                |
| `account`, `auth_event`, `auth_security_state`, `email_queue`, `session`, `user`, `verification` | f   | f     | — (auth/globais; ver §6, item RLS-006)                                                                 |

### Fail-closed — provado em runtime (`merp_app`, sem superuser/BYPASSRLS)

| Cenário                            | Resultado                                                  |
| ---------------------------------- | ---------------------------------------------------------- |
| Sem GUC (`set_config` não chamado) | 0 linhas em `order`/`party`/`product`/`company`/`location` |
| GUC vazia (`''`)                   | 0 linhas                                                   |
| GUC com tenant inexistente         | 0 linhas                                                   |
| INSERT cross-tenant                | `42501` (policy violation)                                 |
| UPDATE/DELETE cross-tenant         | 0 linhas afetadas                                          |
| Leitura cross-tenant               | 0 linhas                                                   |

**Ressalva conhecida (ADR-002, ⚠️ documentada)**: policies location-scoped usam
`(location_id = get_location_id() OR get_location_id() IS NULL)` no `WITH CHECK` —
com GUC de location nula, é possível gravar em **qualquer location do mesmo tenant**.
Fail-closed vale no nível do **tenant**, não da location. Normativo em
`specs/decisions/ADR-002-location-scope.md:28`; decisão arquitetural, não corrigir sem ADR.

---

## 2. Fase A — item a item (7 itens)

| #   | Item                                               | Evidência                                                                                                                                                                                                                                                                                                       | Veredito |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A.1 | Migrações do zero reproduzem o estado              | `merp_audit` PG17: pre-migrate + drizzle-kit migrate + apply-custom-sql → 856/856 statements; catálogo = matriz acima                                                                                                                                                                                           | ✅       |
| A.2 | Todas as tabelas tenant-scoped têm RLS+FORCE       | 16/16 com `relrowsecurity=t` e `relforcerowsecurity=t`; 0 tabelas com `company_id` sem RLS                                                                                                                                                                                                                      | ✅       |
| A.3 | 0025 não afrouxou policies da 0024                 | Diff statements 0024 vs 0025: 52 policies idênticas (8 diferenças só de whitespace/aspas); efeito real da 0025 = só `FORCE` nas 13 tabelas                                                                                                                                                                      | ✅       |
| A.4 | RLS-002 (`company_select_policy` com membership)   | No catálogo: `company_select_policy` = `USING (EXISTS (SELECT 1 FROM company_member ...))` — `drizzle/0016_company_select_membership.sql`                                                                                                                                                                       | ✅       |
| A.5 | RLS-003 (`cm_insert_policy` bootstrap/invite)      | No catálogo: `cm_insert_policy` permite bootstrap do próprio membership — `drizzle/0014_bootstrap_role_split.sql`                                                                                                                                                                                               | ✅       |
| A.6 | SEC-001: role de runtime sem BYPASSRLS             | `merp_app`: `rolsuper=f`, `rolbypassrls=f`, não-dona das tabelas; `merp`: `(t,t)` (só migrações/DDL). Prod usa só `APP_DATABASE_URL` (`docker-compose.prod.yml:14-16`). Papéis garantidos por `0014_app_role_ensure.sql`, `0017_app_role_core_grants.sql`, `0020_app_role_default_privileges.sql`, ADR-007 e CI | ✅       |
| A.7 | Sem `SECURITY DEFINER` inseguro / views / triggers | 5 funções `public`, zero `prosecdef`; zero views/matviews/triggers no catálogo e no repo                                                                                                                                                                                                                        | ✅       |

**Nota sobre A.3**: a "restauração de policies" da 0025 é idempotente e equivalente à 0024 —
não há regressão nem relaxamento. O rollback comentado no fim da 0025 foi executado com
sucesso em `merp_audit` e revertido (ver §5).

---

## 3. Fase B — colaterais do `FORCE` resolvidos

O `FORCE` faz as policies valerem também para o **owner** da tabela. Código que corre sem
contexto de tenant sobre tabelas com RLS+FORCE passa a ver 0 linhas.

| Código                                    | Corre como          | Impacto do FORCE                                                                                    | Resolução                                                                                      |
| ----------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/tasks/process-print-queue.ts`     | Sem GUC de tenant   | **Quebrado**: `db.query.company.findMany` (enumeração cross-tenant) devolve 0 linhas sob `merp_app` | **Removido** (RLS-004, opção 3) — morto desde 0007, não agendado. Linha mantida como histórico |
| `drizzle/0012_invite_token_accept.sql:44` | Superuser (`merp`)  | Nenhum — superuser/BYPASSRLS ignora RLS mesmo com FORCE                                             | Nada a fazer                                                                                   |
| Healthchecks (`SELECT 1`)                 | Superuser           | Nenhum                                                                                              | Nada a fazer                                                                                   |
| Tasks `purge`, seeds de teste             | `ownerDb`/superuser | Nenhum (purge não tem chamadores; seeds usam `ownerDb`)                                             | Nada a fazer                                                                                   |

**Conclusão**: único código quebrado pelo `FORCE` = `process-print-queue.ts`, que já não
funcionava antes (o `company` tinha FORCE desde a 0007). Tratado como pendência 🔴 com 3
opções no §6, sem alteração de código nesta auditoria.

---

## 4. Fase C — testes novos + teste de mutação

### Testes adicionados (commits `d9c7175`, `0197ed3`)

| Ficheiro                          | Testes | Cobre                                                                                                                                                                                                                              |
| --------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/utils/rls-guard.test.ts`  | 5      | Papel da role de runtime (não-superuser, não-BYPASSRLS, não-dona); toda a tabela tenant-scoped tem RLS+FORCE; RLS ⇒ FORCE; zero `SECURITY DEFINER` inseguro; `merp_app` fora da lista BYPASSRLS                                    |
| `server/utils/rls-matrix.test.ts` | 17     | Matriz **catalog-driven**: para cada uma das 16 tabelas — B vê a própria linha, A não lê/insere/atualiza/apaga, sem GUC = 0 linhas, INSERT cross-tenant = `42501`; exceção documentada `company_insert_policy` = `WITH CHECK true` |

Efeito: regressões de RLS passam a falhar a suíte (CI), não só code review.

### C.1 — A suíte corre mesmo como `merp_app`?

`vitest.config.ts:19-22` define `test.env` com `DATABASE_URL` (owner, migrações) **e**
`APP_DATABASE_URL=merp_app`. `test.env` **sobrescreve** o env do CI → mesmo com
`DATABASE_URL` apontando a outro sitio, a suíte usa `merp_app` para queries de app (`db.ts`).
A ressalva do AUD-000 item 6 está **resolvida** (ADR-007). ✅

### C.2 — Teste de mutação (os testes novos realmente falham quando o RLS parte)

Config temporária fora do repo (`/tmp/opencode/vitest.mutation.config.ts`, sem
`globalSetup` — o setup re-aplicaria as policies e anularia a mutação):

| Mutação                                 | Resultado esperado | Observado               |
| --------------------------------------- | ------------------ | ----------------------- |
| M1a: `DROP POLICY party_select_policy`  | `rls-matrix` falha | ✅ FALHOU como esperado |
| M1b: `party_select_policy USING (true)` | `rls-matrix` falha | ✅ "A leu a linha de B" |
| M2: `ALTER TABLE party NO FORCE`        | `rls-guard` falha  | ✅ FALHOU como esperado |

Tudo restaurado e re-verificado verde após as mutações.

### Estado da suíte (fim da auditoria)

| Comando                       | Resultado                                                                 |
| ----------------------------- | ------------------------------------------------------------------------- |
| `pnpm typecheck`              | ✅ limpo                                                                  |
| `pnpm lint`                   | ✅ limpo                                                                  |
| `pnpm test` (sem DB)          | 350 passed / 85 skipped                                                   |
| `DB_AVAILABLE=true pnpm test` | **456 passed / 1 skipped** (54 ficheiros; era 434 antes dos testes novos) |

O 1 skipped é `server/utils/order/repository.spec.ts:76` (`create: inserts order with
items...`) — teste 100% mockado, sem BD/RLS; mantido skipped de propósito.

---

## 5. Commits e migrações (com rollback)

### Commits (nesta auditoria, branch `fix/sql-modeling-rls-audit`)

| Hash      | Mensagem                                                             | Conteúdo                                          |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `db5fb5a` | (base) migração `drizzle/0025_force_rls_fixes.sql`                   | FORCE nas 13 tabelas + "restauração" idempotente  |
| `d9c7175` | `fix(db): RLS-010 guarda CI de role e RLS+FORCE`                     | `server/utils/rls-guard.test.ts`                  |
| `0197ed3` | `fix(db): RLS-011 matriz cross-tenant para todas as tabelas com RLS` | `server/utils/rls-matrix.test.ts`                 |
| `d37377a` | `docs(rls): alinhar docs ao estado real`                             | `architecture-overview.md` + `database-schema.md` |

### Migração auditada: `drizzle/0025_force_rls_fixes.sql`

- **Nunca editada** (regra inegociável). Efeitos: `FORCE ROW LEVEL SECURITY` em 13 tabelas;
  recriação idempotente de policies equivalentes às da 0024 (52 policies idênticas).
- **Idempotência provada**: segunda aplicação via `apply-custom-sql.ts` → 856/856 statements,
  catálogo inalterado.
- **Rollback** (documentado no fim da 0025, executado com sucesso em `merp_audit` e revertido):

```sql
-- ROLLBACK (não executado em produção; testado em merp_audit)
ALTER TABLE "location"        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "party"           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "product"         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_table" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order"           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_item"      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_dine_in"   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_takeout"   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "printer"         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "print_job"       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "cashier_shift"   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "kitchen_station" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "kitchen_ticket"  NO FORCE ROW LEVEL SECURITY;
-- As policies recriadas pela 0025 são equivalentes às da 0024; não requerem restore.
```

**Veredito da 0025**: ✅ segura — não afrouxa nada, único efeito real é o `FORCE`
(fail-closed reforçado). Registro no Drizzle journal: ver §6 (item 🟡 DRIFT-002).

---

## 6. Itens 🔴 pendentes de aprovação (SQL proposto, impacto, rollback)

Nenhum abaixo foi aplicado. Todos exigem decisão humana/ADR.

### RLS-004 ✅ RESOLVIDO (opção 3 — remover a task) — Enumeração cross-tenant em `process-print-queue.ts`

> **Resolução (2026-10-12)**: task **removida** (commit `fix(db): RLS-004`). Era morta desde 0007,
> não agendada, printer em stub. Remover apaga código e elimina a necessidade latente de role
> BYPASSRLS. Se print for preciso, refaz-se com dispatch por tenant (`withTenant`).

`server/tasks/process-print-queue.ts` usava `db.query.company.findMany` para varrer tenants —
impossível sob RLS com `merp_app` (0 linhas). Já não funcionava desde a 0007 (FORCE em `company`);
a task não estava agendada e o printer está em stub.

**Opções** (escolher via ADR):

1. Role worker dedicada com BYPASSRLS (só para tasks; escopo mínimo);
2. Dispatch por tenant (fila de tenants a processar, com `withTenant` por tenant);
3. Remover a task até haver requisito real (YAGNI — recomendado se o printer continua em stub).

**Impacto**: sem efeito em dados (só muda como a task corre). **Rollback**: reverter o commit da opção escolhida.

### RLS-005 ✅ RESOLVIDO (hardening fail-closed) — `company_insert_policy` com `WITH CHECK true`

> **Resolução (2026-10-12)**: `WITH CHECK true` → `WITH CHECK (get_user_id() IS NOT NULL)`
> (migração `0026_company_insert_requires_user.sql`). Mantém self-service (FR-014); só impede
> inserção sem GUC de utilizador (fail-closed). O caminho de produção (`createCompanyWithOwner`)
> seta `app.user_id` via `withTenant` → continua a inserir; `createCompany` (low-level, user
> null) agora é negado com 42501. Teste fail-closed adicionado. **Rollback**: 0026 tem o
> comando comentado (recriar com `WITH CHECK (true)`).

`company_insert_policy` permitia INSERT sem checagem (criação self-service de empresa,
FR-014). Sob `FORCE`, continuava a valer para `merp_app`. Risco: qualquer contexto (mesmo sem
`app.user_id`) criava companies arbitrárias — embora não pudesse **ler** companies alheias
(`company_select_policy` com membership).

### RLS-006 🔴 NÃO APLICADO (precondição falhou) — Tabelas auth sem RLS + PII

7 tabelas sem RLS: `account`, `auth_event`, `auth_security_state`, `email_queue`, `session`,
`user`, `verification`. PII só tem barreira a nível de aplicação.

> **Verificação (2026-10-12) — porquê NÃO aplicar nem sequer em `auth_event`**: a precondição
> "leituras/escritas sob `withTenant`" **falhou**. Os três acessos a `auth_event` correm em
> `db` direto, **sem GUC**:
>
> - **escrita** `createAuthEvent` (`server/utils/shared/audit.ts:20`): `db.insert` sem
>   `withTenant`. Com policy `user_id = get_user_id()`, o `WITH CHECK` falharia (GUC nulo) e o
>   `catch` do FR-023 engoliria o erro → **auditoria pararia em silêncio** (perda de dado de
>   auditoria, pior do que não ter RLS).
> - **leituras** `listUserAuthEvents` (`auth/identity/queries.ts:81`) e `export.get.ts:56`:
>   `db.select` sem GUC → `USING (user_id = get_user_id())` devolveria **0 linhas** → exportação
>   LGPD vazia.
>
> Corrigir exige envolver estes caminhos em `withTenant` (com `app.user_id`) — mas
> `auth/identity/queries.ts` e `api/auth/export.get.ts` são **ficheiros protegidos** (auth). E
> eventos de login falhado têm `user_id` NULL (utilizador ainda não existe) — uma policy
> `user_id = get_user_id()` perde-os ou exige ramo `user_id IS NULL` (que exporia emails de
> tentativas falhadas a outros utilizadores). **Conclusão**: `auth_event` RLS não é a correção
> barata/segura que a análise preliminar sugeriu; é uma mudança que toca auth e precisa de ADR.

Proposta original (via ADR — decidir como Better Auth + audit + export operam sob GUC):

```sql
-- Escopo mínimo sugerido (NÃO aplicar sem antes migrar escrita/leituras para withTenant):
ALTER TABLE auth_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_event_select_policy ON auth_event;
CREATE POLICY auth_event_select_policy ON auth_event FOR SELECT TO merp_app
  USING (user_id = get_user_id());
-- auth_security_state é global por design (rate limiting); decidir se ganha policy ou exceção documentada
```

**Impacto**: `user`/`session`/`account`/`verification` são tocados pelo Better Auth adapter
**sem GUC** (`shared/auth.ts`) — dar RLS a essas tabelas **quebra o login**. Por isso nunca
entraram no escopo. **Rollback**: `DISABLE ROW LEVEL SECURITY` + `DROP POLICY`.

### RLS-007 ✅ RESOLVIDO (vocabulário alinhado; CHECKs adiados) — CHECK constraints spec × código

> **Resolução (2026-10-12)**: vocabulário alinhado **spec → código** (código é a verdade de
> facto, tem dados reais): `print_job` `queued|printed`→`pending|completed`,
> `restaurant_table` `free|cleaning`→`available|closed`, `cashier_shift` `discrepancy`→`reconciled`.
> CHECKs **adiados** — os enums Zod da app já validam no boundary; um CHECK daria pouco ganho
> face a migração + sanear dados. Spec × código deixa de divergir (uma fonte por fato).

Nenhum CHECK constraint existe (catálogo nem `schema.ts`). Queries de detecção de violação
corridas em `merp_audit` e `merp_test` encontraram dados reais fora do vocabulário do spec
(`print_job.status='pending'`, `restaurant_table.status='available'` — vocabulário do código).

Como há violações, os CHECKs **não foram aplicados**. Plano expand/contract (após decisão de
vocabulário — é decisão arquitetural, spec × código divergem):

```sql
-- Fase expand (após decidir vocabulário normativo; NOT VALID para não bloquear migração)
ALTER TABLE print_job ADD CONSTRAINT print_job_status_check
  CHECK (status IN ('...')) NOT VALID;
-- Fase validate (runbook separado, após sanear dados):
-- ALTER TABLE print_job VALIDATE CONSTRAINT print_job_status_check;
```

**Impacto**: decidir o vocabulário primeiro (uma fonte por fato — spec ou código, não ambos).
**Rollback**: `ALTER TABLE ... DROP CONSTRAINT ...`.

### DRIFT-001 🔴 — Drift `server/utils/schema/*.ts` vs migrações (arquivo protegido)

`drizzle-kit check` = "Everything's fine", mas o diff catálogo vs `schema.ts` encontrou 5 drifts
(`server/utils/schema/**` é protegido — reportado, não corrigido):

1. Tabela `email_queue` existe só nas migrações (ausente do `schema.ts`);
2. `print_job.payload`: `jsonb` nas migrações vs `text` no `schema.ts`/push;
3. `user.two_factor_enabled`: só nas migrações;
4. `invite`: unique index `invite_company_email_idx` vs `invite_company_email_unique`;
5. `print_job_priority_created_idx`: `(priority, created_at)` vs `(priority DESC, created_at)`.

**Ação**: decisão humana sobre qual fonte é normativa (schema.ts vs migrações) + migração de
alinhamento forward-only. **Rollback**: reverter a migração de alinhamento.

### DRIFT-002 🟡 — 0025 fora do journal Drizzle

O journal Drizzle termina na 0014; 0015–0025 são aplicadas por `apply-custom-sql.ts`
(`buildCustomSql`). Funciona e é idempotente, mas `drizzle-kit generate`/`migrate` não veem
0025 — quem rodar só `drizzle-kit migrate` fica sem o FORCE. **Ação**: rodar `db:migrate:full`
(documentado) e/ou registrar num ADR de runbook. Sem SQL proposto (é processo).

### DRIFT-003 ✅ resolvido — Volume Docker PG16 × `docker-compose.yml` PG17

O volume `merp_pgdata` continha PG16; o compose exige `postgres:17-alpine` → `docker compose up`
falhava. Não existe `docker volume rename`. **Resolução (2026-10-12, aprovada pelo utilizador)**:
backup `pg_dumpall` do cluster PG16 para `/home/o/Work/merp-backups/backup-merp_pgdata-2026-10-12.sql.gz`,
remoção dos containers/volumes da auditoria e do `merp_pgdata`, e `docker compose up` do zero —
PostgreSQL 17 healthy em volume novo; `db:migrate:full` do zero = 856/856 statements; catálogo
idêntico ao desta auditoria (16 tabelas RLS+FORCE, 65 policies); fail-closed re-confirmado.
A causa era o volume velho, não o compose.

---

## 7. Itens não verificados nesta auditoria

- **Produção de facto**: todo o runtime verificado é local (Docker). O estado do catálogo em
  produção não foi observado (sem acesso; regra: banco só local).
- **Carga/concorrência**: não medido — RLS com `EXISTS` (ex.: `company_select_policy`,
  policies via `order`) tem custo por query; falta benchmark com dados reais.
- **Cobertura de todos os handlers**: a matriz cobre policies no catálogo; não auditei
  handler-a-handler se algum escreve em tabela tenant-scoped **fora** de `withTenant` com GUC
  correta (só verifiquei as tabelas globais e a task de print).
- **`email_queue`**: sem RLS por ser global de fila; não verifiquei se há mais de um tenant a
  partilhá-la em produção (design atual é single-tenant-a-fila).
- **Rollback real em produção da 0025**: testado só em `merp_audit` (descartável).
- **MODEL-001/2/3**: os IDs originais de um relatório intermédio não existem no repo nem no
  histórico git (relatório perdido, não versionado). Os achados correspondentes foram
  reconstruídos a partir de `docs/review/02-banco-schema-rls.md` (P02-A01…A10) e
  `specs/packs/restaurant/spec.md`; equivalências incertas — não afirmar mapeamento 1:1.

---

## 8. Próximos passos priorizados

1. ~~**Decidir RLS-004** (`process-print-queue`)~~ — **resolvido**: opção 3 aplicada (task removida,
   morta desde 0007, não agendada); elimina a necessidade latente de role BYPASSRLS.
2. ~~**Decidir vocabulário de status** (`print_job`, `restaurant_table`)~~ — **resolvido**: spec
   alinhada ao código (`pending`/`completed`, `available`/`closed`, `reconciled`); CHECKs adiados
   (enums Zod já validam no boundary). Liberta RLS-007.
3. **Decidir DRIFT-001** (fonte normativa: `schema.ts` ou migrações) → migração de alinhamento
   forward-only para os 5 drifts.
4. ~~**DRIFT-003** (volume PG16 vs compose PG17)~~ — **resolvido** (backup + volume novo PG17;
   ver §6).
5. **RLS-006** (`auth_event` etc.): **não é a correção barata que a análise preliminar sugeriu** —
   as leituras/escritas de `auth_event` correm em `db` sem GUC (`audit.ts`, `queries.ts`,
   `export.get.ts`); aplicar RLS quebraria auditoria (silenciosamente) e exportação LGPD.
   Exige ADR + migrar esses caminhos para `withTenant` (ficheiros protegidos de auth) e decidir
   o caso `user_id IS NULL` (logins falhados). Não aplicar sem isso.
6. ~~**RLS-005** (`company_insert WITH CHECK true`)~~ — **resolvido**: `WITH CHECK
(get_user_id() IS NOT NULL)` (0026), fail-closed, mantém self-service FR-014.
7. **DRIFT-002**: incorporar `db:migrate:full` (não só `drizzle-kit migrate`) em runbook/CI.
8. **DRIFT-001** (fonte normativa: `schema.ts` ou migrações) → migração de alinhamento
   forward-only para os 5 drifts — por decidir (arquivo `server/utils/schema/**` protegido).
9. **Corrigir `specs/README.md`**: lista 3 dívidas já pagas (assinatura `withTenant` com
   `locationId`, schemas núcleo, `line_total`) como pendentes; só a dívida ADR-011 (deploy
   reexecuta 0024/RLS em produção) continua aberta.
10. Manter `rls-guard.test.ts` + `rls-matrix.test.ts` como guarda permanente em CI — qualquer
    nova tabela tenant-scoped sem RLS+FORCE ou policy afrouxada quebra a suíte.

> **Feito nesta sessão** (2026-10-12): RLS-004 (task print removida), RLS-005 (0026 +
> teste fail-closed), RLS-007 (vocabulário alinhado), FSM `kitchen_ticket` (guarda de transição
>
> - 422), guarda FORCE (`assertRlsForceApplied`) e comment-safety do transformador SQL.
>   Verdes: 55 ficheiros / 461 testes, `merp`/`merp_test` 16 RLS + 16 FORCE + 65 policies.
