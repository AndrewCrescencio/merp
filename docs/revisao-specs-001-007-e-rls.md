# Revisões técnicas — specs 001–007 e auditoria RLS (Fases 1–2)

Consolidação em arquivo único das revisões realizadas. Data: 2026-09-22.

- Parte 1: Revisão das specs `specs/001–007` (clínica geral: domínio, segurança, dados, API, operação, docs).
- Parte 2: Fase 1 — Auditoria de isolamento multi-tenant (RLS), read-only.
- Parte 3: Fase 2, item 0 — verificação prévia de roles (STOP reportado, sem alterações).

---

# PARTE 1 — Revisão técnica das specs (`specs/001–007`)

Base: leitura dos 13 arquivos de `specs/` cruzada com a implementação real
(`server/utils/auth/tenant-context.ts`, `server/utils/schema/company.ts`,
`server/utils/db.ts`, `drizzle/0014–0016`, `PENDING_DECISIONS.md`, `AGENTS.md`).
Só é afirmado como fato o que está escrito; o resto é "não especificado".

## 1. Resumo executivo

Maturidade geral: **média-baixa, desigual**. O `001-auth-context` é detalhado
(spec + contrato + data-model + tasks, ~1500 linhas) e a implementação
acompanha bem; `002` é um bom diagnóstico de arquitetura; `003–007` são
**rascunhos de 40–100 linhas** (pseudo-DDL + tabela de endpoints),
insuficientes como spec executável. Há contradições internas no 001 e
divergências spec↔código.

3 riscos mais críticos:

1. **Direção do produto indefinida** — `003–007` especificam ERP genérico
   (sales orders, invoices, vendors), mas o briefing pede restaurante (mesa,
   comanda, KDS, NFC-e: zero ocorrências nas specs). `PENDING_DECISIONS.md`
   confirma dois roadmaps concorrentes travando o Sprint 0.
2. **Isolamento multi-tenant subespecificado** — RLS definido em 3 linhas
   vagas no data-model; `003–007` delegam tudo a "ver 0016 como modelo". Sem
   policies por tabela/operação, sem papel app vs. migração, sem regra para
   views/joins/functions, e a assinatura do `withTenant` diverge entre spec e
   código.
3. **Contradições testáveis no auth** — cenário de aceite exige `409` para
   email duplicado enquanto FR/contrato exigem `201` genérico
   anti-enumeração; `SC-006` ("within 5 attempts") contradiz `FR-010`
   (limite de 5/min); `Session` no data-model não tem `activeCompanyId`, mas
   o endpoint `switch` escreve nele.

## 2. Tabela de achados

| ID  | Sev.    | Cat.        | Local                                                                                                                            | Problema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Impacto                                                                                                                        | Recomendação                                                                                                                                                                                                                                                  |
| --- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Crítico | domínio     | `003–007/plan.md` vs briefing                                                                                                    | Nenhuma entidade de restaurante especificada (Mesa, Comanda, Pedido de salão, KDS, Turno/Caixa, Reserva, Delivery, Ficha Técnica, Insumo, Impressora, NFC-e/SAT). `PENDING_DECISIONS.md` confirma roadmap duplo A×B sem decisão.                                                                                                                                                                                                                                                                                | Todo o trabalho de `003–007` pode ser descartado se a decisão for restaurante; sprints partem de premissa errada.              | Travar Decisão 1 antes de qualquer Sprint 0; arquivar o roadmap preterido. Se restaurante: criar `008-restaurant-*` e tratar `003–007` como descartados, não como plano vigente.                                                                              |
| F02 | Crítico | domínio/API | `001/spec.md` US3 + FR-015 vs `contracts/auth-api.md` (AUD-10) + `tasks.md` T031                                                 | Contradição funcional: spec exige "search for an existing company to join" (US3 cenários 2, FR-015), mas o contrato restringe a busca a empresas onde o caller **já é membro** ("name/CNPJ of unrelated companies never leak") e T031 marca join-by-ID como SUPERSEDED (só via invite). Do jeito contratado, descobrir empresa para pedir acesso é impossível.                                                                                                                                                  | Fluxo de "join" inespecificável/testável; teste de aceite da US3 não passa contra o contrato.                                  | Decidir um dos dois: (a) busca aberta com rate limit + resposta anti-enumeração, ou (b) join exclusivamente por convite (e então reescrever US3/FR-015). Hoje spec e contrato dizem coisas opostas.                                                           |
| F03 | Crítico | segurança   | `001/data-model.md` §Tenant Isolation; `003–007` ("RLS por tenant, ver 0016")                                                    | RLS nunca especificado por tabela/operação: data-model lista 3 bullets ("RLS by company_id"); `003–007` delegam a um exemplo. Não especificado: role app (`merp_app`) vs role de migração, `BYPASSRLS`, `FOR ALL` vs por-operação, vazamento via joins/views/`SECURITY DEFINER`, policies das tabelas globais (`user`, `session`, `auth_event`), tratamento de operações cross-tenant legítimas (007-relatórios agregados conflitam com "sem super_admin", FR-019).                                             | Falsa sensação de cobertura; cada fase recriará policies ad hoc; risco real de leak cross-tenant em joins e relatórios.        | Escrever uma seção "RLS padrão" normativa (template de policy por tipo de tabela + matriz tabela×operação×role + regra "functions com `SECURITY DEFINER` proibidas salvo revisão") e referenciá-la de cada fase em vez de "ver 0016".                         |
| F04 | Crítico | docs        | `001/spec.md` US1 cenário 4 vs FR-003 + contrato (AUD-03) + `tasks.md` T017                                                      | Cenário de aceite exige "rejects with a conflict error" para email duplicado; FR/contrato/tasks exigem `201` genérico idêntico ao de criação (anti-enumeração, "never 409"). O teste de aceite contradiz o requisito.                                                                                                                                                                                                                                                                                           | Time implementa/testa comportamento errado; auditoria de segurança reprova.                                                    | Reescrever o cenário 4 da US1 para: "retorna o mesmo 201 genérico, sem criar duplicata, sem sinal observável".                                                                                                                                                |
| F05 | Crítico | dados/API   | `004`, `005/plan.md` ("idempotência de pay em aberto", "transições em aberto")                                                   | Operações de dinheiro sem especificação de transação nem idempotência: `pay` sob retry ("não pode duplicar baixa" listado como em aberto), máquina de estados de `sales_order`/`invoice` sem transições válidas, sem `Idempotency-Key`, sem chave de idempotência em `payment` (ex.: `UNIQUE(company_id, idempotency_key)`), sem regra "totais recalculados no servidor" formalizada como FR testável.                                                                                                          | Dupla cobrança/double-spend em retry de rede; estados inválidos (ex.: `delivered` → `draft`).                                  | Antes do Sprint 2/3: FRs para (a) chave de idempotência obrigatória em `pay`/criação de pedido, (b) transação cobrindo pedido→baixa→pagamento, (c) matriz de transições válidas com código de erro (400 vs 422 — hoje citados ambos).                         |
| F06 | Alto    | segurança   | `001/data-model.md` (Session) vs contrato `companies/switch` + `002/architecture.md` §3.2                                        | Coluna `session.activeCompanyId` não existe no data-model (tabela Session tem 7 campos, sem tenant), mas `switch` a escreve e o repo `company` a lê. Mecanismo de propagação tenant→query também diverge: spec diz `withTenant(tenantId, fn)`; código real é `withTenant(tenantId, userId, fn, existingTx?)` com GUCs `app.tenant_id`/`app.user_id`. Melhor-Auth escreve sessão pelo adapter — fora do `withTenant`? Não especificado.                                                                          | Schema incompleto; auditor não consegue validar o caminho sessão→tenant→RLS de ponta a ponta.                                  | Adicionar `active_company_id` (nullable, FK) à tabela Session no data-model + documentar quem escreve sessão (adapter Better Auth vs repositório) e se queries do adapter passam por RLS. Corrigir a assinatura do `withTenant` na spec.                      |
| F07 | Alto    | auth        | `001/*` (2FA)                                                                                                                    | `two_factor_enabled`, tabela `TwoFactor` (TOTP + backup codes) existem no data-model, mas **zero** fluxos/endpoints documentados (enroll, challenge no login, recovery, lockout de TOTP). Spec declara "MFA" fora de escopo? Não — silêncio total, enquanto a tabela sugere escopo parcial.                                                                                                                                                                                                                     | Código morto ou feature fantasma; se implementada sem spec, vira superfície de ataque não revisada (bypass de 2FA no login).   | Ou remover `TwoFactor` do data-model (deferido explícito) ou especificar o fluxo mínimo (enroll → challenge → backup codes, com erros anti-enumeração).                                                                                                       |
| F08 | Alto    | auth        | `001/spec.md` SC-006 vs FR-010; contrato §Rate limits vs spec                                                                    | Três limites (20 req/min por IP, 5 por email, 60 por usuário autenticado) só existem no contrato (AUD-16); FR-010 cita só 5/email. SC-006 diz "kicks in within 5 attempts" (off-by-one contra limite 5) e mistura lockout com rate limit.                                                                                                                                                                                                                                                                       | Implementação e teste de carga seguem números diferentes; SC-006 é infalsificável ("within 5" — 4? 5?).                        | Consolidar todos os limites num único lugar normativo (sugiro o contrato) e referenciá-lo da spec; reescrever SC-006 com o número exato e observável (ex.: "a 6ª requisição no window retorna 429").                                                          |
| F09 | Alto    | auth        | `001/research.md` (SameSite=Lax) vs `contracts/auth-api.md` (SameSite=Strict)                                                    | Flag SameSite diverge entre research e contrato.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Cookie com `Strict` quebra fluxos legítimos pós-redirect (verify-email, reset via link); com `Lax` a doc mente.                | Definir um valor e o motivo (para links mágicos por email, `Lax` é o correto; documentar).                                                                                                                                                                    |
| F10 | Alto    | dados       | `003/plan.md` DDL draft                                                                                                          | `slug`/`sku` declarados `UNIQUE` global no pseudo-DDL (o próprio texto alerta que "quebra multi-tenant"), `id text` com `gen_random_uuid()` (tipo incoerente: UUID em coluna text), sem `company_id` em `product_image`, sem índices `(company_id, created_at)` em nenhuma tabela `003–007`, sem decisão soft×hard delete por entidade (003 diz soft em products; 006 exige preservar FKs fiscais sem dizer como).                                                                                              | DDL copiado como está quebra isolamento e performance (full scan por tenant em `product`, `sales_order`, `invoice`).           | Regra normativa: todo UNIQUE de negócio é `(company_id, campo)`; PK `uuid` (não text); `company_id NOT NULL` em **todas** incluindo tabelas-filhas (`product_image`, `sales_order_item`); índice `(company_id, created_at)` padrão em entidades de movimento. |
| F11 | Alto    | dados       | `003–005/plan.md` (`numeric(12,2)` sem justificativa)                                                                            | Dinheiro em `numeric(12,2)` sem justificar vs centavos-inteiro, sem regra de arredondamento (half-up? por linha ou por total?), sem teto (`numeric(12,2)` = até ~1 tri — suficiente? não dito), e `quantity integer` impede fracionados (kg em restaurante).                                                                                                                                                                                                                                                    | Divergência de centavos em totais fiscais; retrabalho de migração se mudarem para centavos depois.                             | ADR curto: `numeric(12,2)` + arredondamento half-up no servidor por linha, total = soma das linhas (nunca input do cliente); `quantity numeric` onde houver fracionado.                                                                                       |
| F12 | Alto    | auth/API    | `001` (validação, CSRF, versionamento)                                                                                           | Biblioteca de validação nunca nomeada (Zod? Valibot? — o briefing pergunta, a doc não responde); CSRF isenta `register/login/forget/reset/send-verification` mas não justifica por que `logout` autenticado exige CSRF enquanto `me`/`export` (GET com PII) são GET sem proteção além de sessão; versionamento de API (`/api/v1`) não considerado em nenhum contrato; `GET /health` e `/metrics` públicos sem rate limit documentado.                                                                           | Validação ad hoc por handler; quebra futura sem versionamento; health/metrics viram oráculo de DDoS/recon.                     | Nomear Zod (ou o que o código usa) como padrão + `GET /me`/`export` com nota de PII; adotar `/api/v1` ou registrar "sem versionamento até v1" como decisão; rate limit explícito em health/metrics.                                                           |
| F13 | Alto    | operação    | `001/spec.md` §Data Governance; `003–007`                                                                                        | Retenção contraditória: auth logs 90d vs "PII access logs 5y" vs IP 90d vs "deactivated 5y" — qual tabela segue qual regra? Backup/restore, RTO/RPO, migração zero-downtime (existe applier custom `apply-custom-sql.ts` + `0014_app_role_ensure` — **indocumentados nas specs**), feature flags/rollout, fila de email (tabela `EmailQueue` existe, worker não especificado), cron de purge além de sessions: tudo ausente.                                                                                    | Perda de dados sem runbook; deploy com migração trava (o bug `0014` prova que o caminho de migração limpa já quebrou uma vez). | Runbook mínimo: backup/restore + RTO/RPO, ordem applier vs `drizzle-kit migrate`, worker da `EmailQueue`, e resolver a contradição 90d×5y por tabela.                                                                                                         |
| F14 | Médio   | docs        | `001/plan.md` ("checklists/failure.md, api.md"), `002` ("checklists/architecture.md CHK017–019"), refs `AUD-01…20`, `CHK005/007` | Rastreabilidade quebrada: diretório `checklists/` **não existe**; códigos AUD/CHK são citados ~30× mas nunca definidos nas specs (definições vivem em `SECURITY_AUDIT.md`, não linkado). `quickstart.md` lista `companies.join.post.ts` (superseded) e paths pré-slices (`repository.ts`, `helpers.ts`, `schema.ts` único).                                                                                                                                                                                     | Dev novo segue link morto; auditor não fecha a matriz requisito↔código.                                                        | Criar `specs/001-auth-context/checklists/` ou remover as refs; centralizar glossário AUD/CHK com link; atualizar quickstart aos paths reais (`identity/`, `company/`, `invite/`, `shared/`).                                                                  |
| F15 | Médio   | docs        | `003–007` + `002` §3.2 (identity 19 métodos, company 13 — acima do teto de 10)                                                   | `003–007` não seguem o template que exigem (sem FRs, sem cenários de aceite, sem códigos de erro por endpoint, sem matriz RLS); `002` registra exceção à própria regra (>10 métodos "justificado") sem critério de quando fatiar. Tabelas de endpoint usam `PUT/PATCH` e `GET/POST` como "tanto faz" (004: purchase-orders "GET/POST" numa linha).                                                                                                                                                              | Specs `003–007` não são implementáveis sem reinterpretação; verbos ambíguos geram APIs inconsistentes.                         | Exigir para cada fase: FRs numerados, 1 verbo por endpoint, erros por endpoint, e transformar a exceção do `002` em regra ("fatiar quando >10 **ou** >3 tabelas, o que ocorrer primeiro").                                                                    |
| F16 | Médio   | segurança   | `001` (sessão 7d fixa, `disableSessionRefresh`)                                                                                  | TTL fixo de 7d sem refresh não justificado para o contexto real: terminal de PDV/KDS compartilhado com sessão de 7 dias é risco; revogação em troca de turno, `rememberMe` em dispositivo compartilhado, e expiração mid-request em emissão fiscal (só define o 401, sem estratégia de resume/reattempt) não tratados. `GET /reset-password/[token]` redireciona com token no **hash** — correto, mas sem nota sobre `Referer`/logs do frontend.                                                                | Sessão longa em terminal compartilhado; operador perde venda no meio por 401 sem fluxo de recuperação.                         | ADR de sessão por perfil (PDV compartilhado: TTL curto + PIN de turno; backoffice: 7d), ou registrar "7d + logout obrigatório fim de turno" como regra operacional.                                                                                           |
| F17 | Médio   | domínio     | `004–006`                                                                                                                        | Máquina de estados citada mas nunca desenhada: `sales_order` tem 6 status, `invoice` 6, `payment` 4, `customer` 2 — sem diagrama, sem matriz de transições, sem dono da transição (repositório vs handler — 004 diz "no repositório, não só no handler" como intenção, não como FR). `overdue` automático (job vs regra de leitura) em aberto; `contact_person` com `customer_id` + `vendor_id` anuláveis sem constraint "exatamente um".                                                                       | Transições inválidas só descobertas em teste; `overdue` implementado de 3 jeitos diferentes.                                   | Um diagrama de estados por entidade + constraint `CHECK (num_nonnulls(customer_id, vendor_id) = 1)` no `contact_person`.                                                                                                                                      |
| F18 | Baixo   | docs        | geral                                                                                                                            | Sem glossário (tenant vs company vs organization — Better Auth tem plugin `organization`, mas o modelo é custom `company_*`; o mapeamento nunca é declarado), sem índice central das specs, sem data de revisão/versionamento por doc (só 001 tem datas), sem diagramas ER/C4/sequência, convenção de nomes diverge (`company` singular no schema vs `companies` na API; `id text` vs "UUID" no data-model; `razaoSocial` camelCase no JSON vs `razao_social` no banco — ok, mas não declarado como convenção). | Onboarding lento; cada leitor reinventa o mapeamento.                                                                          | `specs/README.md` índice + glossário (tenant=company; organization plugin **não** usado — declarar) + convenção de nomes (tabela singular, coluna snake_case, JSON camelCase) + "última revisão" por arquivo.                                                 |

Pontos positivos (para não perder): contrato de erro `{error, message}`
consistente e bem tipado; anti-enumeração em register/login/recovery bem
pensada; token de invite single-use com hash SHA-256 e consumo atômico com
`FOR UPDATE`; `withTenant` fail-closed com `NULL` limpando GUC;
purge/anonymization com prazos LGPD explícitos; colocation de testes; `002`
com bridge temporária e migração por fase — bom padrão.

## 3. Lacunas de documentação (o que deveria existir e não existe)

1. **Decisão A×B (restaurante vs genérico)** — `PENDING_DECISIONS.md` existe
   fora de `specs/`; nada em `specs/` a referencia.
2. **Modelo Better Auth ↔ modelo custom**: usa o plugin `organization`? Não
   — mas nunca declarado. Mapear `session.activeCompanyId`,
   `organizationId`, `auth.uid()` equivalente.
3. **Padrão RLS normativo** (ver F03) + matriz tabela×operação×role +
   política de `BYPASSRLS`/roles de migração.
4. **Fluxo 2FA** (ou remoção da tabela do data-model) — F07.
5. **Transações críticas**: fechar conta + pagamento + baixa de estoque;
   criação de pedido + reserva; `switch` + remoção de membro (este último
   está no contrato AUD-13, mas sem FR correspondente na spec).
6. **Idempotência de escrita** — F05.
7. **Runbooks**: backup/restore, migração limpa (applier custom), worker
   `EmailQueue`, cron jobs, rotação de `BETTER_AUTH_SECRET`.
8. **Observabilidade de restaurante**: latência de PDV, fila de KDS, falha de
   impressão, reconciliação fiscal — zero menções.
9. **Fiscal BR**: NFC-e/SAT/CNPJ por unidade, contingência offline (PDV que
   vende sem internet é requisito clássico e inexiste nas specs).
10. **RBAC**: matriz owner/member→Manager/Staff/Viewer (007 adia para Sprint
    4, mas 004–006 já precisam de "quem pode cancelar/estornar").
11. **Versionamento de API, paginação/filtros padrão, feature flags,
    i18n/PT-BR** (citados como perguntas no plano ERP, sem resposta nas
    specs).

## 4. Sugestões de estrutura

- `specs/README.md` como índice (status por fase, dono, última revisão) —
  hoje só `AGENTS.md` aponta para `001/plan.md`, e `001/plan.md` aponta para
  `checklists/` inexistentes.
- Mover `PENDING_DECISIONS.md` (ou espelhar) para dentro de `specs/` —
  decisão de roadmap é parte da spec, não handoff de chat.
- Um `specs/000-foundation/` com o transversal: convenções de nomes, padrão
  RLS, padrão de endpoint (erro/CSRF/rate limit/paginação), padrão de
  dinheiro, glossário tenant/company/organization. `003–007` então
  referenciam em vez de repetir "ver 0016 como modelo".
- `003–007` promovidos de "plan.md rascunho" para o trio
  spec/contract/data-model do 001 (mesmo que enxutos) — hoje não há contrato
  nem modelo de dados revisável por fase.
- ADRs para: numeric vs centavos, 7d sem refresh, sem `/v1`, `text` vs
  `uuid` nos IDs, invite-only vs join aberto. Hoje as decisões vivem em
  comentários SQL (`0014_app_role_ensure`!) e evaporam.

## 5. Perguntas abertas (responder antes de fechar a spec)

1. Roadmap A ou B? Se restaurante: 1 company = 1 unidade ou multi-unidade
   (`location`)? (bloqueia RLS e fiscal)
2. Join de empresa: busca aberta ou só convite? (F02)
3. Better Auth `organization` plugin ou tabelas custom — declarar e mapear
   `activeCompanyId`? (F06)
4. Sessão 7d vale para terminal compartilhado de PDV/KDS? Qual o fluxo de
   troca de turno? (F16)
5. 2FA: implementar agora ou remover do schema? (F07)
6. Gateway de pagamento (Stripe/MercadoPago) ou tracking interno? (herdada
   do plano ERP §10, sem resposta)
7. Exigências fiscais: NFC-e/SAT por unidade? Contingência offline do PDV?
8. Retenção: 90 dias ou 5 anos para auth/PII logs — por tabela? (F13)
9. RBAC mínimo viável antes de vendas/financeiro (quem pode cancelar pedido,
   estornar, ver relatório)? (007 adia tudo p/ Sprint 4)
10. CI com Docker/integração já rodou verde ao menos uma vez?
    (`PENDING_DECISIONS.md` diz que nunca — specs assumem RLS "validado por
    testes" que pularam sem Docker.)

## 6. Reescrita sugerida (trechos críticos, no padrão proposto)

**R1 — US1 cenário 4 (spec.md:93-94), hoje contraditório:**

```md
4. **Given** um email já registrado, **When** outro usuário tenta registrar-se
   com o mesmo email, **Then** o sistema responde `201 Created` com corpo
   idêntico ao de um registro novo (AUD-03, anti-enumeração) e **não** cria
   duplicata (FR-003 = unicidade no banco, não código de erro). Nunca `409`.
```

Padrão: cenário de aceite espelha o código de erro contratual, não a
intuição ("rejeita → 409").

**R2 — §Tenant Isolation (data-model.md:211-218), hoje 3 bullets vagos:**

```md
## Tenant Isolation (normativo)

- Tabelas tenant-scoped (`company`, `company_member`, `invite`, e todas de
  003–007): `company_id NOT NULL` + policy `FOR ALL USING (company_id =
NULLIF(current_setting('app.tenant_id', true), '')::text)`; `WITH CHECK`
  idêntico para INSERT/UPDATE. Leitura fora do tenant retorna 0 rows → API
  responde 404 genérico (nunca distinguir "inexistente" de "sem acesso").
- Tabelas globais (`user`, `session`, `account`, `verification`, `auth_event`,
  `email_queue`, `auth_security_state`): sem RLS de tenant; acesso via
  `merp_app` com policies restritas por operação (documentar por tabela).
- Propagação: `withTenant(tenantId, userId, fn, existingTx?)` (assinatura
  normativa) é o único caminho; `SET LOCAL` via `set_config(..., true)`;
  `NULL` limpa o GUC (fail-closed). Queries do adapter Better Auth: [declarar
  se passam por withTenant ou por policy própria].
- Proibido `SECURITY DEFINER`, `BYPASSRLS`, e views sem `security_invoker`
  sem revisão de segurança registrada. Cross-tenant (relatórios agregados,
  suporte): apenas via role dedicada com policy própria + audit log — nunca
  via bypass.
```

Padrão: cada afirmação é verificável (policy nomeada, teste "fora do tenant
→ 0 rows" já exigido na spec).

**R3 — Cabeçalho de `003–007/plan.md` (pseudo-DDL como spec), padrão mínimo
por fase:**

```md
> Status, dono, última revisão e dependências no `specs/README.md`.
> Regras herdadas de `specs/000-foundation/`: RLS padrão, UNIQUE=(company_id,…),
> PK uuid, money=numeric(12,2)+half-up no servidor, erro={error,message}.

## FRs (numerados, testáveis) — ex.: FR-CAT-001: criar produto exige

`company_id` do tenant ativo; SKU único por (company_id, sku); 409 em conflito…

## Endpoints — 1 verbo por linha, com erros: `POST /api/v1/products → 201 |

400 validation_error | 409 conflict | 401/403 | 429`

## Matriz RLS — tabela × SELECT/INSERT/UPDATE/DELETE × role

## Máquina de estados — diagrama + transições válidas + código de erro (422)
```

Padrão: fase sem FR numerado, sem erros por endpoint e sem matriz RLS não
abre sprint.

Nota de escopo: conteúdo de restaurante (mesa/comanda/KDS/fiscal) não foi
reescrito porque a Decisão 1 estava pendente — escrever isso seria inventar
produto. F01–F03, F05 e as perguntas 1–7 travam qualquer sprint; o resto pode
andar em paralelo.

---

# PARTE 2 — Fase 1: auditoria de isolamento multi-tenant (RLS)

Auditoria read-only (nenhum arquivo modificado). Sem Docker no ambiente, nada
foi executado: vereditos ⏸️ onde a confirmação exige runtime.

Escopo auditado: `server/utils/schema/*.ts`, `server/utils/auth/tenant-context.ts`,
`drizzle/0005–0019` (policies, roles, functions), role de conexão, `withTenant`,
tabelas globais, adapter Better Auth.

## Tabelas tenant-scoped

Legenda: ✅ conforme | ⚠️ conforme com ressalva | ❌ não conforme | N/A não aplicável

### `company` — raiz do tenant (`server/utils/schema/company.ts:5-23`)

| Critério              | Evidência                                                                                                                                                                                                                                                 | Veredito    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `company_id` NOT NULL | N/A — ela **é** o tenant (`id` PK, `company.ts:8-10`)                                                                                                                                                                                                     | N/A         |
| Policy por operação   | SELECT `drizzle/0016_company_select_membership.sql:11`; INSERT `0008:8`; UPDATE `0009:7`; DELETE `0009:11`                                                                                                                                                | ✅          |
| USING = WITH CHECK    | SELECT/DELETE: USING-only (correto — sem WITH CHECK nessas ops). UPDATE: USING-only → o PG usa o USING como check da nova linha (equivalente). INSERT: `WITH CHECK (true)` — aberto **por design** (criação self-service, FR-014)                         | ✅ / ⚠️ doc |
| Fail-closed           | `id = get_tenant_id()` + `get_tenant_id() = NULLIF(current_setting('app.tenant_id',true),'')` (`0005:1-7`) → GUC ausente = NULL = 0 rows. INSERT usa `withTenant(companyId pré-gerado)` (`company/repository.ts:55-56`) p/ o `RETURNING` passar na policy | ✅          |
| Índice                | PK `id`; `cnpj` único, `name`, `is_deleted` (`company.ts:18-22`). Sem `(company_id,…)` porque é a raiz                                                                                                                                                    | ✅          |

### `company_member` (`server/utils/schema/company.ts:25-44`)

| Critério              | Evidência                                                                                                                                                                                | Veredito |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `company_id` NOT NULL | `company.ts:31-33` + FK cascade                                                                                                                                                          | ✅       |
| Policy por operação   | SELECT `0005:27`; INSERT `0014_bootstrap_role_split.sql:12` (vigente; 0005/0008/0012 superseded e marcadas como tal); UPDATE `0008:23`; DELETE `0010_member_delete_self.sql:16`          | ✅       |
| USING = WITH CHECK    | SELECT/DELETE: USING-only ✅. INSERT: WITH CHECK-only ✅ (forma correta). **UPDATE: USING (`company_id = get_tenant_id()`) ≠ WITH CHECK (`is_company_owner(company_id)`)** — assimétrico | ⚠️       |
| Fail-closed           | Via `get_*()` (NULLIF) ✅; `withTenant(null,…)` limpa p/ `''` (`tenant-context.ts:21-22`)                                                                                                | ✅       |
| Índice                | `UNIQUE(company_id,user_id)` + índices single em ambas (`company.ts:40-44`)                                                                                                              | ✅       |

Sobre o ⚠️ do UPDATE: **sem caminho explorável** — `grep update(companyMember)
server/` retorna zero; o app nunca faz UPDATE nessa tabela (só INSERT/DELETE).
Desvio do padrão estrito, não buraco ativo.

### `invite` (`server/utils/schema/invite.ts:6-35`)

| Critério              | Evidência                                                                                                                                                                                                                                                                                                       | Veredito  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `company_id` NOT NULL | `invite.ts:12-14` + FK cascade                                                                                                                                                                                                                                                                                  | ✅        |
| Policy por operação   | SELECT `0006:25` + token `0012_invite_token_accept.sql:36`; INSERT `0006:28`; UPDATE `0013_invite_owner_update.sql:7`; DELETE `0013:32`                                                                                                                                                                         | ✅        |
| USING = WITH CHECK    | INSERT/DELETE: forma correta ✅. **UPDATE: USING tem `"accepted_at" IS NULL` no branch de claim, WITH CHECK não** — analisado: sem buraco (o USING barra re-update de convite consumido no branch claim; o `WHERE` do app em `invite/repository.ts:172-177` reforça; owner-branch não depende de `accepted_at`) | ⚠️ nuance |
| Fail-closed           | `company_id = get_tenant_id()` ✅. Branch de token usa `current_setting('app.invite_token_hash',true)` **direto** (sem NULLIF) — quando ausente retorna NULL → `token_hash = NULL` → nega ✅ (fail-closed por outro mecanismo; `token_hash` nunca é `''` em rows reais)                                         | ✅        |
| Índice                | `UNIQUE(company_id,email)` + parciais `invite_pending_email/token_hash` (`invite.ts:27-35`)                                                                                                                                                                                                                     | ✅        |

`invite_delete_policy` (`0013:32`): `USING (is_company_owner(company_id))` **sem
checagem de GUC de tenant** — qualquer owner daquela empresa deleta,
independente de contexto. Por design (escopo = a própria linha); não "corrigir".

### `two_factor` — user-scoped com RLS (`server/utils/schema/two-factor.ts`, `drizzle/0013_two_factor_rls.sql`)

| Critério              | Evidência                                                                                                         | Veredito |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| `company_id` NOT NULL | N/A — escopo é usuário, não tenant                                                                                | N/A      |
| Policy por operação   | SELECT/INSERT/UPDATE/DELETE, todas `user_id = get_user_id()`, UPDATE com USING=WITH CHECK idênticos (`0013:1-15`) | ✅       |
| Fail-closed           | GUC ausente → NULL → 0 rows ✅                                                                                    | ✅       |
| Índice                | `two_factor_user_id_idx` (`two-factor.ts:19`)                                                                     | ✅       |
| FORCE RLS             | `0013:1-2` ENABLE + FORCE ✅                                                                                      | ✅       |

## Itens 6–13

**6. Role de runtime — ✅ verificado (código).** `merp_app`, `LOGIN +
NOBYPASSRLS + INHERIT` (defaults): `docker-compose.prod.yml:15-16` injeta
**só** `APP_DATABASE_URL` (`${APP_DATABASE_URL?…obrigatória}`);
`.env.example:14-18` ("non-owner, non-superuser… Obrigatória em produção");
`server/plugins/validate-env.ts:16` recusa boot sem ela;
`0014_app_role_ensure.sql:18-19` documenta os atributos;
`apply-custom-sql.test.ts:240` asserta `{login:true, bypassrls:false,
inherit:true}`. **Ressalva:** os testes de integração **não** rodam como
`merp_app` — `vitest.config.ts` seta só `DATABASE_URL=postgres://merp:merp`
(owner) e nenhum teste seta `APP_DATABASE_URL` → `db.ts:23` cai no owner. O
exercício funcional das policies vale pelo `FORCE`, mas grants/atributos da
role real só são cobertos pelo teste de attrs, não pelo CRUD.

**7. Role de migração ≠ runtime — ✅.** Migração = owner `merp` via
`DATABASE_URL` (`drizzle.config.ts`, `test-setup.ts:7,71`, applier `psql -U
merp` em `apply-custom-sql.ts:46`). Runtime prod = `merp_app`, e
`DATABASE_URL` **não entra no container** (`docker-compose.prod.yml:13-15`,
AUD-19/AUD-26). **Ressalva:** em dev local sem `APP_DATABASE_URL`, `db.ts:23`
cai para o owner — `FORCE RLS` (`0007`, `0013`) ainda segura as 4 tabelas com
policy, mas tabelas globais e qualquer tabela futura sem `FORCE` ficam sem
backstop. Comportamento conhecido e comentado em `validate-env.ts:7-9`; só
dev, nunca prod.

**8. SECURITY DEFINER — ✅.** Zero ocorrências em `drizzle/`, `server/`,
`shared/`. `get_tenant_id`, `get_user_id` (`0005:1-7`) e `is_company_owner`
(`0006:1-5`) são `LANGUAGE SQL STABLE` sem `DEFINER` → _invoker rights_. Nada
a corrigir.

**9. Views sem `security_invoker` — ✅ (vazio).** Zero `CREATE VIEW` /
`MATERIALIZED VIEW` no repo. Nada a corrigir.

**10. Assinatura + SET LOCAL — ✅.**
`withTenant(tenantId: string|null, userId: string|null, fn, existingTx?)`
(`tenant-context.ts:12-17`);
`set_config('app.tenant_id'/'app.user_id', …, true)` (`:21-22`) — 3º arg
`true` = **SET LOCAL (escopo de transação)**. Mesma forma nos 4 setters
auxiliares (`company/repository.ts:105,169`; `invite/repository.ts:141,167`).
Único `SET` session-level do repo está no scaffold de teste
(`apply-custom-sql.test.ts:282-283`, conexão dedicada descartável) — **não
copiar para código de app**.

**11. SET vs SET LOCAL — ✅ (código).** Produção usa exclusivamente
`set_config(...,true)` (item 10). SET LOCAL reverte automaticamente em
COMMIT/ROLLBACK por semântica do PG → sem vazamento no pool por esse vetor.

**12. Mesma transação que o GUC — ✅ (código), ⏸️ execução.**
`db.transaction()` → `this.client.begin()`
(`node_modules/drizzle-orm/postgres-js/session.js:109`) — o postgres-js
reserva **uma conexão** para todo o callback; SET LOCAL + queries do `tx`
rodam nela. Cobertura dos call sites: todo acesso a tabela tenant-scoped
passa pelo `tx` do `withTenant` — company repo
(`:56,98-121,164,202,236,277,293,322,359,412,459`), invite repo
(`:63,88,111,137-157,163-193`), identity `:550`; **nenhum
handler/middleware/task toca `company`/`company_member`/`invite` direto**;
`identity` direto no `db` só toca tabelas globais
(`identity/repository.ts:430,441,479,495,504,569` — `user`/`session`);
`shared/*` direto no `db` só toca
`auth_event`/`email_queue`/`auth_security_state`/`session`. ⏸️ Não executado
(sem Docker; `.test.ts` pula sem `DB_AVAILABLE`) — exigir o teste de
não-vazamento no pool antes de fechar.

**13. `tenantId` nulo — ✅ (código + teste existente, não executado).**
`tenantId ?? ''` (`tenant-context.ts:21`) limpa o GUC; `NULLIF→NULL→nega`.
Cobertura aninhada em `tenant-context.test.ts:85-106`. Nota: o tipo TS é
`string | null` (sem `undefined`), mas o `??` cobre `undefined` em runtime
mesmo assim.

## Tabelas globais (sem RLS de tenant — correto)

`user`, `session`, `account`, `verification` (`0000`), `auth_event` (`0002`),
`auth_security_state` (`0018`), `email_queue` + `two_factor` criadas em
(`0012/0019`) — **nenhum `ENABLE RLS`** além dos 4 já citados. Proteção
efetiva: (a) só `merp_app` tem DML (`0015`, `0017`); (b) todas as queries são
chaveadas por id/email/token do chamador autenticado; (c) `FORCE` nas 4
tabelas com policy impede que o owner contorne. Duas ressalvas (sem código,
p/ runbook): **(i)** `0017` faz `GRANT … ON ALL TABLES` existentes — **sem
`ALTER DEFAULT PRIVILEGES`**, então tabelas futuras (003–007) nascem sem
grant → falha ruidosa (fail-loud, não leak); **(ii)** PII em
`auth_event.email`/`user` não tem barreira além de app-level — aceitável, mas
registrar como decisão.

## Better Auth

Adapter = `drizzleAdapter(db)` na **mesma pool, sem `withTenant`**
(`shared/auth.ts:20-29`) — toca `user`/`session`/`account`/`verification`
(sem RLS ✅ sem interferência) **e `twoFactor` (COM RLS FORCE)**. Como o
adapter nunca seta GUCs, qualquer acesso do plugin `twoFactor`
(`shared/auth.ts:93-107`) à tabela seria negado (0 rows). **Hoje sem
impacto**: nada no app escreve `twoFactorEnabled=true` (só schema + plugin
registrado; nenhum handler/repo referencia `two_factor`). ⚠️ **Landmine
latente**: ao implementar enroll/challenge de 2FA, o adapter precisa operar
sob GUC ou as policies precisam de exceção documentada — validar em runtime
antes de lançar 2FA. Middleware de sessão (`server/middleware/auth.ts:89-99`)
valida via `auth.api.getSession` (tabela `session`, global) e propaga tenant
via `activeCompanyId` em memória (`:137-144`) — sem leitura tenant-scoped
fora de `withTenant`. ✅

## Resumo para aprovação

Achados que viram trabalho: **(a)** alinhar `cm_update_policy`
(USING≠WITH CHECK) ou documentar a assimetria; **(b)** considerar `ALTER
DEFAULT PRIVILEGES` p/ `merp_app`; **(c)** teste de integração rodando como
`merp_app` (não só owner); **(d)** ao tocar 2FA, resolver o conflito
adapter×RLS. **Não** mexer: `company_insert WITH CHECK(true)` (design),
`invite_delete` sem GUC (design), funções `STABLE` (corretas), `SET` do teste
probe (scaffold). Itens ⏸️ pendentes de execução: suite `.test.ts` com
`DB_AVAILABLE=true` e teste de pool sob concorrência.

---

# PARTE 3 — Fase 2, item 0: verificação prévia de roles (STOP)

Status: **PARADO por gate — nenhum arquivo alterado, itens 1–3 não
executados.**

## Resultado

O `SELECT rolname, rolsuper, rolbypassrls …` não pôde ser executado — **sem
banco acessível no ambiente** (sem Docker, sem Postgres local na 5432, sem
cliente `psql`). Mas a resposta é determinável por evidência convergente de
que **`merp` é superuser** em qualquer ambiente montado a partir deste repo:

1. **`docker-compose.yml`** — Postgres sobe com `POSTGRES_USER:
${DB_USER:-merp}`. A imagem oficial `postgres:16-alpine` cria o
   `POSTGRES_USER` como **superuser do cluster** (`initdb` bootstrap).
2. **`server/utils/test-setup.ts:7`** — `TEST_DB_URL =
'postgres://merp:merp@…/merp_test'`; **`vitest.config.ts`** injeta
   `DATABASE_URL=postgres://merp:merp…` sem nunca setar `APP_DATABASE_URL` →
   toda a suite `.test.ts` conecta como `merp`.
3. **`server/utils/apply-custom-sql.test.ts:298`** — o próprio código declara:
   `"Seed como owner (superuser bypassa RLS)"`.

## Por que isso invalida o veredito do item 6 da Fase 1

Semântica do Postgres (`ALTER TABLE … FORCE ROW LEVEL SECURITY): `FORCE`
submete o **table owner** às policies, mas **`SUPERUSER`e`BYPASSRLS`fazem
bypass sempre, inclusive com`FORCE`\*\*. Logo:

- Todos os testes de RLS que rodam via `db` (owner `merp`) —
  `tenant-context.test.ts`, `company/repository.test.ts` (outsider),
  `invite/repository.test.ts`, `security.test.ts` — **passam vacuamente**:
  asserções do tipo "outsider recebe 0 rows" são verdadeiras porque _ninguém_
  é filtrado, não porque a policy negou. A "cobertura funcional via FORCE"
  da Fase 1 **não se sustenta para essas suites**.
- Exceção: os testes `(d)` de `apply-custom-sql.test.ts`, que usam a role
  probe `rls_probe_*` (`GRANT merp_app`, `NOBYPASSRLS`) — esses sim exercem
  policies de verdade.
- Produção **não** está afetada por este vetor: o app só sobe com
  `APP_DATABASE_URL` (`validate-env.ts:16`, compose prod com `${…?…}`), e
  `merp_app` é `NOBYPASSRLS` (asserto em `apply-custom-sql.test.ts:240`). O
  dano é na **validade dos testes**, não no runtime de prod.

## P0 proposto (antes dos itens 1–3 da Fase 2)

1. Num ambiente com Docker, rodar o query do item 0 para registro formal
   (esperado: `merp:(t,f)`, `merp_app:(f,f)`).
2. **Teste-canário**: asserção que falha se RLS estiver em bypass (a suite
   real deve rodar como `merp_app`). Impede regressão silenciosa da validade.
3. **Migrar a suite de integração para `merp_app`**: setar
   `APP_DATABASE_URL=postgres://merp_app:…` no setup de teste e re-rodar tudo
   com `DB_AVAILABLE=true`. O que quebrar por falta de grant revela
   dependência de privilégio de owner — corrigir com grants mínimos, não
   voltando ao owner.
4. Só então executar os itens 1–3 da Fase 2, com os testes 3a/3b rodando sob
   a role de app.
