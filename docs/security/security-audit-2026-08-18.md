# Auditoria de Segurança — Revisão completa do repositório (2026-08-18)

**Data:** 2026-08-18
**Escopo:** Código completo — `server/` (API, middleware, utils, plugins, tasks), `shared/`, `drizzle/` (RLS), `infra/nginx`, `docker-compose*`, `Dockerfile`, `nuxt.config.ts`
**Objetivo:** Documentar achados da revisão de segurança integral do repositório (excluídos docs/markdown). Correções aplicadas pelos prompts `prompts/33`, `34` e `35` (executados em ordem na mesma data); pendências registradas em `docs/pendencies.md`.

---

## Problemas catalogados

### AUD-15 — Rate limit do nginx (5 req/min por IP) é bucket compartilhado e trava uso legítimo

- **Categoria:** disponibilidade (DoS)
- **Severidade:** alta — qualquer usuário atrás do mesmo IP (NAT corporativo/Café) ou um atacante exaure o bucket de todos; fluxo legítimo de login (POST + me + companies + switch ≈ 4-5 requests) estoura a janela de 1 min.
- **Localização:** `infra/nginx/nginx.conf:8` (`limit_req_zone ... rate=5r/m`), `:136-140` e `:142-157` (`burst=5 nodelay`)
- **Descrição:** A zona `auth_limit` limita 5 req/min por IP **compartilhados entre todos os endpoints `/api/auth/`**. O `burst=5 nodelay` só permite 5 rápidas; depois, tudo é 429. A app já possui rate limit fino por IP (20/min, sliding window, `server/utils/shared/security.ts:28`) e por email (5/min) — o nginx deveria ser camada grossa anti-anomalia, não o gate fino. Como é o único limitador efetivo das rotas autenticadas, qualquer uso realista do app o estoura.
- **Impacto / exploração:** DoS trivial: atacante (mesmo sem conta) dispara 6 requests contra `/api/auth/login` de um IP → todos os usuários daquele IP ficam bloqueados por 1 min em TODOS os endpoints de auth (login, me, export, invites). NAT compartilhado transforma um usuário legítimo em "atacante" para os demais.
- **Status:** resolvido (prompt 33, commit `fix(infra): nginx rate limit 5->20r/m burst 10 (AUD-15)`)

**Resolução (2026-08-18):**

- **Decisão:** o nginx passa a ser explicitamente a camada **grossa** anti-anomalia (por IP); a camada fina (sliding window: 5/min por email, 20/min por IP, 60/min por usuário — AUD-16) vive na app.
- **Correção aplicada:** `rate=20r/m` na zona `auth_limit` (alinhado ao `MAX_REQUESTS_PER_IP` da app) e `burst=10 nodelay` nos dois locations (`/api/auth/` e o location catch-all do server 443) — o burst absorve o fluxo legítimo de login. Comentários AUD-11 atualizados documentando a divisão de camadas.
- **Testes:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` valida; `nginx -t` limpo.

---

### AUD-16 — Sem rate limit por usuário nas rotas autenticadas + 1 insert de auditoria por request

- **Categoria:** DoS / integridade de auditoria
- **Severidade:** alta — conta é barata (registro aberto, 20/min por IP); com N contas um atacante martela endpoints protegidos sem teto por usuário.
- **Localização:** `server/middleware/auth.ts:115` (evento `session_validated` por request), endpoints autenticados (`me.get.ts`, `export.get.ts`, `invites.get.ts`, `companies.*`) sem `checkIpRateLimit`
- **Descrição:** Todo request protegido grava `session_validated` em `auth_event` (retenção 90 dias, `server/tasks/purge-auth-events.ts:6`) e endpoints como `/api/auth/export` (3 queries) não têm teto por usuário/IP na app. O nginx limita por IP (AUD-15), mas a app não tem camada por usuário — e o bucket do nginx é contornável com IPs rotativos.
- **Impacto / exploração:** Atacante com contas próprias em IPs rotativos satura o pool de 10 conexões do postgres-js (`server/utils/db.ts`) com queries + inserts de auditoria por request, e enche `auth_event` de lixo (90 dias de retenção). Requests 429 do rate limit por IP ainda geram `session_validated` se a sessão for válida — auditoria contaminada.
- **Status:** resolvido (prompt 33, commit `fix(auth): rate limit por usuario nas rotas autenticadas (AUD-16)`)

**Resolução (2026-08-18):**

- **Correção aplicada:**
  - `server/utils/shared/security.ts` — `MAX_REQUESTS_PER_USER = 60` e `checkUserRateLimit(event, userId)` exportada, reusando `checkRateLimitKey` interna com chave `rate:user:${userId}` (mesmo padrão de `checkIpRateLimit`/`checkEmailRateLimit`).
  - `server/middleware/auth.ts` — `await checkUserRateLimit(event, session.user.id)` após sessão válida e **antes** do `emitSessionEvent` e do set do contexto: requests 429 não geram `session_validated` (auditoria limpa) nem avançam o contexto.
- **Garantias verificadas (testes + banco real):** sessão válida com limite não atingido segue e emite evento; limite atingido → 429 e `createAuthEvent` NÃO chamado; rotas públicas sem o check; chave `rate:user:` persiste no DB e a janela desliza (integração, mesmo padrão do teste de `checkIpRateLimit`).
- **Testes:** `server/middleware/auth.spec.ts` (3 casos novos), `server/utils/shared/security.spec.ts` (unit da janela/limite com `MAX_REQUESTS_PER_USER`), `server/utils/shared/security.test.ts` (integração da chave no DB).

---

### AUD-17 — GET com PII sem `Cache-Control: no-store`

- **Categoria:** vazamento de dados (cache)
- **Severidade:** média — email, nome, CNPJ e dados de sessão trafegam em GET; navegador/histórico/proxy intermediário podem cachear em máquina compartilhada.
- **Localização:** `server/api/auth/me.get.ts`, `server/api/auth/export.get.ts`, `server/api/auth/invites.get.ts`; `infra/nginx/nginx.conf` (no-store só em `/` e `/api/auth/reset-password`)
- **Descrição:** As respostas GET com PII não levam `Cache-Control: no-store` — nem da app nem do nginx (o nginx só cobre `/` e o fluxo de reset, `nginx.conf:121,147`). GET não-autenticado de `/api/auth/export` (nome, email, cnpj, razaoSocial, sessões) pode ser servido de cache de navegador/proxy.
- **Impacto / exploração:** em máquina compartilhada ou via proxy corporativo, o histórico/cache expõe os dados; usuário desloga mas os dados persistem em cache local.
- **Status:** resolvido (prompt 34, commit `fix(security): no-store em todas as rotas /api/ (AUD-17)`)

**Resolução (2026-08-18):**

- **Correção aplicada:** novo `server/middleware/no-store.ts` — para qualquer request com pathname começando em `/api/`, `setResponseHeaders(event, { 'cache-control': 'no-store, no-cache, must-revalidate' })`. Um ponto cobre me/export/invites/health + rotas futuras; nenhum header duplicado nos handlers.
- **Testes:** `server/middleware/no-store.spec.ts` — `/api/auth/me` recebe o header; `/` (raiz) não recebe; headers mantidos em throw do handler.

---

### AUD-18 — Token de reset de senha em claro no banco (`verification`)

- **Categoria:** segurança de dados em repouso
- **Severidade:** média — dump do banco permite account takeover sem senha.
- **Localização:** `server/utils/auth/identity/repository.ts:415-431` (`validateResetToken` lê por `identifier = reset-password:<token>`); tabela `verification` (`server/utils/schema/identity.ts:76`)
- **Descrição:** O fluxo de reset do better-auth guarda o token cru no `identifier` da tabela `verification` (nunca hasheado). O projeto já hasheou os tokens de convite (AUD-01, `invite.ts`), mas o reset segue o design do better-auth. A tabela `verification` também guarda o JWT de verificação de email.
- **Impacto / exploração:** quem obtém dump do banco (backup, restauração, insiders com acesso de leitura) consegue redefinir a senha de qualquer conta sem o email da vítima. Mitigação existente: o dump já expõe senhas scrypt e tokens de sessão — o risco é a classe "banco comprometido", não um vetor adicional isolado.
- **Status:** pendente — **risco aceito** (registrado em `docs/pendencies.md`, item 30). É design do better-auth: hashear exigiria customizar o fluxo de reset (plugin ou `verification` customizada). Mitigação: dump do banco já expõe o resto (senhas scrypt, sessões); o banco é protegido por rede/role mínima (AUD-19).
- **Correção planejada:** nenhuma por ora; reavaliar se o fluxo de reset for customizado.

---

### AUD-19 — Role `merp_app` e grants core fora de migração; `DATABASE_URL` (owner) no container do app

- **Categoria:** operacional / superfície de credencial
- **Severidade:** média — deploy em produção depende de passo manual; esquecer = app 500 em tudo.
- **Localização:** `drizzle/0015_app_role_grants.sql` (só cobre `auth_security_state`, `auth_event`, `invite`); `docker-compose.prod.yml:11` (`DATABASE_URL` injetada no container); criação da role/grants core só em `server/utils/test-setup.ts:81-94` e prompts/docs
- **Descrição:** A criação da role `merp_app` e os grants DML em `user`, `session`, `account`, `verification`, `company`, `company_member` não existem em nenhuma migração — vivem em `test-setup.ts` (testes) e na documentação de operação. Em produção, o operador precisa replicar manualmente. Além disso, o compose injeta `DATABASE_URL` (credencial do role **owner**) no container do app, que em runtime só usa `APP_DATABASE_URL` — a credencial owner fica exposta dentro do container sem necessidade.
- **Impacto / exploração:** (a) deploy sem os grants → `permission denied` → 500 em todos os endpoints; (b) container do app comprometido expõe a credencial owner do banco (role que burla FORCE RLS se usada para conectar — embora o app conecte com `APP_DATABASE_URL`, a credencial owner na env é um vetor extra).
- **Status:** resolvido (prompt 36, commit `fix(security): role/grants core em migração e DATABASE_URL fora do container (AUD-19)`)

**Resolução (2026-08-19):**

- **Correção aplicada:** `drizzle/0017_app_role_core_grants.sql` — migração idempotente (padrão `apply-custom-sql`): DO block cria a role `merp_app` se ausente (sem senha — segredo de operação via `APP_DATABASE_URL`) + `GRANT USAGE ON SCHEMA public` + DML em `ALL TABLES`/`ALL SEQUENCES`. `docker-compose.prod.yml` — `DATABASE_URL` (owner) removida do container do app (runtime usa só `APP_DATABASE_URL`, já exigida no boot). `server/utils/test-setup.ts` — `ensureAppRole` reduzida a garantir a senha de teste (`ALTER ROLE` idempotente); grants agora vêm da migração.
- **Testes:** suíte de integração roda contra a migração 0017 (role criada sem senha → ALTER ROLE do test-setup) — `pnpm test`.

---

### AUD-20 — `company_select_policy` aberta e `findCompanyById` sem membership

- **Categoria:** autorização (defesa em profundidade)
- **Severidade:** média — hoje é oráculo de existência; é o ponto onde um endpoint futuro vaza dados.
- **Localização:** `drizzle/0004_military_rocket_raccoon.sql` (`company_select_policy`: `is_deleted = false OR id = get_tenant_id()`); `server/utils/auth/company/repository.ts:220-232` (`findCompanyById` sem `withTenant`)
- **Descrição:** A policy permite a qualquer role (com `SELECT` na tabela) ler **todas** as empresas não-deletadas. O app roda `findCompanyById` sem contexto de tenant → qualquer usuário autenticado tem oráculo de existência de empresa por ID (200/404) via `switch`/`update`/`delete`/`invite`/`invites`. Os handlers atuais não devolvem a row para não-membros, mas a policy é o único gate no banco — remover o check de app em um endpoint futuro vazaria `name`/`cnpj`/`razaoSocial` de qualquer empresa.
- **Impacto / exploração:** confirmação de existência/status (deletada) de empresas por ID; sem vazamento de dados hoje (IDs são UUIDv4, obtidos apenas por membros).
- **Status:** resolvido (prompt 36, commit `fix(security): company_select_policy restrita a membership e findCompanyById com userId (AUD-20)`)

**Resolução (2026-08-19):**

- **Correção aplicada:** `drizzle/0016_company_select_membership.sql` — policy restrita a `id = get_tenant_id()` OU `EXISTS (SELECT 1 FROM company_member cm WHERE cm.company_id = company.id AND cm.user_id = get_user_id())` (o escape por tenant preserva os `UPDATE/DELETE ... RETURNING` do soft-delete/update, que rodam com `withTenant`). `server/utils/auth/company/repository.ts` — `findCompanyById(id, userId)` roda com `withTenant(null, userId)`: outsider → 0 rows → `null` → 404 nos handlers; `createCompany`/`createCompanyWithOwner` geram o id no app (`randomUUID()`) e setam o tenant GUC antes do `INSERT ... RETURNING` (a SELECT policy filtra rows retornadas — sem GUC, o RETURNING viria vazio). 6 handlers passam `user.id`.
- **Testes:** `repository.test.ts` — novo caso `AUD-20: an outsider cannot read a company by id` (outsider → null, owner → row); chamadas existentes de `findCompanyById` ajustadas para o owner; suíte completa rodando com a policy restrita.

---

### AUD-21 — Sem tetos de tamanho em `name`/`cnpj`/`razaoSocial` de empresa

- **Categoria:** robustez / DoS de banco
- **Severidade:** baixa — input gigante quebra o índice btree → 500; PII desproporcional na coluna.
- **Localização:** `server/api/auth/companies.post.ts:23-34`, `server/api/auth/companies.update.post.ts:33-50`; `company_name_idx` btree (`server/utils/schema/company.ts:21`)
- **Descrição:** AUD-14 cobriu tetos de email/password/name/consent/search (`server/utils/shared/security.ts:20-24`), mas não os campos de empresa. Um `name` > ~2704 bytes (btree) → erro de índice → 500; colunas de PII gigantes.
- **Impacto / exploração:** 500 auto-induzido por request; sem escalada.
- **Status:** resolvido (prompt 34, commit `fix(auth): tetos de empresa, regex de email compartilhado, types no body (AUD-21/22/23)`)

**Resolução (2026-08-18):**

- **Correção aplicada:** `server/utils/shared/security.ts` — `MAX_COMPANY_NAME_LENGTH=200`, `MAX_CNPJ_LENGTH=30`, `MAX_RAZAO_SOCIAL_LENGTH=200`; validados em `companies.post.ts` (name ≤200, cnpj ≤30 se presente, razaoSocial ≤200) e `companies.update.post.ts` (mesmos tetos no input montado), com `sendValidationError` e mensagens claras.
- **Testes:** specs dos dois handlers (ex.: name 201 chars → 400).

---

### AUD-22 — Validação de email fraca (`includes('@')`) em rotas públicas

- **Categoria:** robustez / disponibilidade
- **Severidade:** baixa — `a@b` passa no register → conta criada com email impossível → presa em `email_not_verified` (self-DoS).
- **Localização:** `server/api/auth/register.post.ts:28`, `server/api/auth/forget-password.post.ts:19`, `server/api/auth/send-verification-email.post.ts:21`; regex correto só em `server/api/auth/invite.post.ts:13`
- **Descrição:** register/forget/send-verification aceitam qualquer string com `@`; o invite tem `EMAIL_REGEX` correto. O better-auth pode aceitar o email malformado (sem validação estrita de formato) → conta criada que nunca recebe verificação.
- **Impacto / exploração:** self-DoS do próprio usuário; sem vetor externo.
- **Status:** resolvido (prompt 34, commit `fix(auth): tetos de empresa, regex de email compartilhado, types no body (AUD-21/22/23)`)

**Resolução (2026-08-18):**

- **Correção aplicada:** `EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` exportado de `server/utils/shared/security.ts` (movido de `invite.post.ts:13`) e usado nas 4 rotas públicas (register, forget-password, send-verification-email, invite — que removeu a constante local).
- **Testes:** specs existentes ajustados se algum email de teste não casava o regex; suíte completa verde.

---

### AUD-23 — Body types lax → 500 em vez de 400

- **Categoria:** robustez
- **Severidade:** baixa — TypeError → 500 interno para input malformado (não-explorável).
- **Localização:** `server/api/auth/login.post.ts:49-63` (`password` numérico passa a checagem de truthiness), `server/api/auth/companies.post.ts:21-34` (`cnpj` numérico → `.trim` não é função)
- **Descrição:** Validações de tipo incompletas: `!body?.password` aceita `password: 5` (length `undefined` → passa); `body.cnpj?.trim()` em número → TypeError. O error-handler devolve 500 genérico (sem vazamento), mas a classe do erro é errada.
- **Impacto / exploração:** 500 auto-induzido; sem escalada.
- **Status:** resolvido (prompt 34, commit `fix(auth): tetos de empresa, regex de email compartilhado, types no body (AUD-21/22/23)`)

**Resolução (2026-08-18):**

- **Correção aplicada:** `login.post.ts` — `typeof body.password !== 'string'` entra na validação (hoje só `!body?.password`) → `sendValidationError`; `companies.post.ts` — `cnpj`/`razaoSocial` com `typeof !== 'string'` → 400 (hoje TypeError → 500).
- **Testes:** spec do login com password numérico → 400; spec do companies.post com cnpj numérico → 400.

---

### AUD-24 — `BETTER_AUTH_SECRET` não exigida no boot de produção

- **Categoria:** configuração
- **Severidade:** baixa — deploy fora do compose sobe sem secret (better-auth cobre com erro, mas o padrão AUD-05 é fail explícito no boot).
- **Localização:** `server/plugins/validate-env.ts:9-20`
- **Descrição:** O `validate-env` exige `CORS_ORIGIN`, `BETTER_AUTH_URL`, `APP_DATABASE_URL` e CIDRs — mas não `BETTER_AUTH_SECRET` (só o compose prod exige via `${BETTER_AUTH_SECRET?}`). Secret fraca/menor que 32 chars também passa despercebida (o `.env` local tem len=36).
- **Impacto / exploração:** assinatura de tokens (verificação de email, reset) com secret fraca/ausente em deploy fora do compose → forja de tokens se conhecida.
- **Status:** resolvido (prompt 35, commit `fix(auth): exigir BETTER_AUTH_SECRET no boot de produção (AUD-24)`)

**Resolução (2026-08-18):**

- **Correção aplicada:** `server/plugins/validate-env.ts` — em produção, `BETTER_AUTH_SECRET` ausente **ou** com `< 32` caracteres entra na lista de ausentes (`BETTER_AUTH_SECRET (mínimo 32 caracteres)`), no mesmo padrão fail-fast das demais (boot recusado com a mensagem conjunta). Fora de produção o check não roda (dev/CI intocados).
- **Testes:** `server/plugins/validate-env.spec.ts` — secret ausente/encurtada (31 chars) flagradas em produção; `>= 32` aceita; ausente fora de produção = ok (caso existente preservado).

---

### AUD-25 — `/api/health` público sem rate limit

- **Categoria:** robustez
- **Severidade:** baixa — 1 SELECT por request, ilimitado; amplificador trivial de carga no banco.
- **Localização:** `server/api/health.get.ts`; `server/middleware/auth.ts:8-17` (rota pública)
- **Descrição:** Health check público executa `SELECT 1` + inicialização do auth a cada request, sem rate limit (nem app nem nginx — fica fora de `/api/auth/`).
- **Impacto / exploração:** carga mínima por request; só relevante com volume alto.
- **Status:** **aceito** (decisão registrada em `docs/pendencies.md`, item 35) — health checks de orquestradores precisam de baixa latência e alta taxa; se virar problema de carga, limitar por IP na app.
- **Correção planejada:** nenhuma por ora.

---

## Observações (não são achados ativos)

- **`cm_insert_policy` permite owner inserir outro owner** (`drizzle/0014_bootstrap_role_split.sql`) — decisão da 0008, por design; nenhum endpoint expõe "add member com role" hoje (a única via é convite com role fixa `member`). Mina adormecida: nunca expor role variável nesse caminho.
- **`session.token` em claro na tabela `session`** — design do better-auth; dump do banco → session hijack (mesma classe do AUD-18).
- **`sendOnSignIn` reenvia email de verificação** a cada login com senha correta de conta não-verificada — quem possui a senha pode spammar a vítima; limitado a 5/min por email (rate limit).
- **`BETTER_AUTH_SECRET` no `.env` local tem 36 chars** — dentro do mínimo recomendado (32+); agora validada no boot de produção (AUD-24).
- **`.env` não está versionado** (`.gitignore:6`) — verificado.

## Priorização sugerida (original)

1. **AUD-15 + AUD-16** (alta, prompts/33) — disponibilidade/DoS. ✅ resolvidos
2. **AUD-17** (média, prompts/34) — PII em cache. ✅ resolvido
3. **AUD-19** (média, prompts/36) — processo de deploy / superfície de credencial. ✅ resolvido
4. **AUD-18 / AUD-20** (média) — risco aceito documentado / defesa em profundidade. AUD-18 ⏳ aceito; AUD-20 ✅ resolvido (prompts/36)
5. **AUD-21 a AUD-24** (baixa, prompts/34 e 35) — robustez. ✅ resolvidos

## Verificação

Prompts 33 → 34 → 35 executados em ordem em 2026-08-18. Após cada prompt: `pnpm test` + `pnpm lint` verdes. Status finais: 9 resolvidos (AUD-15/16/17/21/22/23/24), 1 aceito (AUD-25), 3 pendentes registrados em `docs/pendencies.md` (AUD-18 risco aceito, AUD-19 operacional, AUD-20 defesa em profundidade).
