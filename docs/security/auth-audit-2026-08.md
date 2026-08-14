# Auditoria de Segurança — Bounded Context de Auth

**Data:** 2026-08-10
**Escopo:** `server/` (API, middleware, utils), `shared/`, `drizzle/` (RLS)
**Objetivo:** Documentar falhas de segurança remanescentes para insumo de planos/prompts/tasks futuros. Nenhuma correção foi aplicada.

---

## Problemas catalogados

### AUD-01 — Aceite de convite sem token secreto

- **Categoria:** autorização
- **Severidade:** média — classe de maior impacto (privilege escalation entre tenants), mas exploração exige um bug no app; a RLS não funciona como backstop neste fluxo.
- **Localização:** `server/api/auth/invites.accept.post.ts:23`; `drizzle/0008_policy_insert_owner.sql:13-19` (`cm_insert_policy`)
- **Descrição:** O convite é aceito por `(companyId + email da sessão)`, sem token secreto. O único gate é a checagem no app (`findPendingInvite`), que busca invite pendente para o email autenticado. A policy `cm_insert_policy` aceita `user_id = get_user_id()` — e o chamador define `app.user_id` para si mesmo via `withTenant` — então não há reavaliação de autorização no banco.
- **Impacto / exploração:** Se qualquer refactor futuro remover ou enfraquecer o check de `findPendingInvite`, um usuário autenticado pode inserir a si mesmo como `member` em qualquer empresa (basta conhecer o `companyId`, que é exposto na busca pública). O RLS que aparenta ser backstop não cobre este caminho.
- **Status:** resolvido

**Resolução (2026-08-11):**

- **Decisão:** aceite passou a exigir **token secreto de uso único** (256 bits, `randomBytes(32)` base64url), persistido apenas como hash SHA-256 (`token_hash`) — dump da base não vaza tokens utilizáveis. O token é devolvido **uma única vez** na resposta do `POST /invite` (fluxo sem infra de email; o link de convite futuro sairá do token). O `companyId` não é mais enviado no aceite — o token identifica o convite (e a empresa). Email da sessão deve casar com o email do convite (defesa em profundidade; posse do token provaria o acesso pelo email de destino).
- **Correção aplicada:**
  - `server/utils/schema/invite.ts` — coluna `token_hash` (nullable para permitir push em tabela com linhas; o app sempre seta) + índice parcial (`invite_pending_token_hash_idx`).
  - `drizzle/0012_invite_token_accept.sql` (novo) — **backstop RLS** em `cm_insert_policy`: o self-insert em `company_member` deixa de ser incondicional — exige (a) flag `app.allow_owner_bootstrap` (setado apenas nos caminhos confiados: `createCompanyWithOwner` e `createCompanyMember`) ou (b) `app.invite_token_hash` (GUC setado no mesmo tx do aceite) casando um convite não-expirado para o email da sessão (`EXISTS` na policy). Remover o check do app deixa de ser suficiente — o banco nega na execução. Convites pré-token (sem `token_hash`) são invalidados (expirados). Nova policy `invite_token_select_policy` permite ler o convite por token (fora do contexto de tenant) — sem token setado, `current_setting` → NULL → nunca casa (fail-closed).
  - `server/utils/auth/invite/repository.ts` — `createInvite` gera token/hash e devolve o token cru (nunca o hash para fora); `acceptInvite(token, email, userId)` faz lookup por hash + **claim atômico de uso único** (`UPDATE ... WHERE accepted_at IS NULL` → 0 rows = token já usado/expirado → 404 genérico), com os GUCs de tenant/token setados na mesma transação; `toInviteResult` garante que `token_hash` nunca vaza em `invites.get`/respostas.
  - `server/utils/auth/company/repository.ts` — flag `app.allow_owner_bootstrap` setado em `createCompanyWithOwner` e `createCompanyMember` (caminhos confiados; fixtures de teste usam este método).
  - `server/api/auth/invites.accept.post.ts` — body `{ token }`; erros genéricos (404 "Invite not found or expired") para inválido/expirado/consumido/email errado (anti-enumeração, alinhado a AUD-03/06/07). `server/api/auth/invite.post.ts` — resposta inclui `token` (única exposição; não vai para auditoria).
  - `specs/001-auth-context/contracts/auth-api.md` — contratos `POST /invite`, `POST /invites/accept` e `GET /invites` documentados com o novo body `{ token }` (mudança de contrato segura: sem frontend no repo).
- **Garantias verificadas (testes + banco real):** token aceito uma única vez (replay → 404); token forjado/corrompido → 404; token apresentado por outro email (mesmo com posse) → 404 e convite segue válido; token expirado → 404; `token_hash` nunca exposto fora do repositório; **backstop RLS comprovado**: INSERT direto de member sem token nem flag → negado pelo banco (`42501`) e nenhuma linha criada.
- **Risco residual declarado:** o token existe fora do banco (resposta de API) — logado por proxies de request se o corpo for logado (aceitável: uso único + TTL 7d; o fluxo definitivo é link por email). A policy `invite_token_select_policy` permite ler o convite a quem possuir o token — necessário para o lookup.
- **Residual `invite_update_policy`/`invite_delete_policy` (registrado para revisão): resolvido (2026-08-14)** — members podiam `UPDATE`/`DELETE` invites não-aceitos da própria empresa (policy antiga só exigia tenant). Migration `drizzle/0013_invite_owner_update.sql`: `UPDATE` exige owner **ou** claim por token (email da sessão + `token_hash` no GUC + pendente + não expirado — preserva o `acceptInvite`, que roda com o contexto do convidado ainda não-member); `DELETE` é owner-only. Backstop verificado por teste de integração (member → 42501, invite intacto). Registro completo em `docs/pendencies.md` (item 17).
- **Testes:** integração `server/utils/auth/invite/repository.test.ts` (7 casos, incl. backstop RLS) + unit `invites.accept.post.spec.ts` (token obrigatório, email da sessão nunca do body, propagação de 404) + `invite.post.spec.ts` (token na resposta).

---

### AUD-02 — Lockout DoS por email

- **Categoria:** DoS
- **Severidade:** média — explorável hoje, sem nenhum bug, por qualquer atacante que conheça o email da vítima.
- **Localização:** `server/utils/shared/security.ts:151` (`checkAccountLockout`), `:18` (`MAX_FAILED_ATTEMPTS`), `:141` (`MAX_REQUESTS_PER_IP`)
- **Descrição:** A chave `lockout:<email>` é baseada apenas no email. O lockout é disparado após 10 falhas sem vínculo com o IP de origem. O rate limit por IP (20/min) é contornado com rotação de IPs.
- **Impacto / exploração:** Atacante com um IP rotativo faz 10 tentativas erradas para o email da vítima → conta bloqueada por 30min; repetindo, o bloqueio se torna permanente (logout forçado, login impossível). Não há alerta ou limite de lockouts repetidos.
- **Status:** resolvido (commit `fix(auth): two-tier lockout keyed by email+IP (AUD-02)` — ver `git log --grep="AUD-02"`)
- **Perguntas em aberto:**
  - O lockout deve ser keyed por (email + IP) ou (email + fingerprint de dispositivo)?
  - O limiar de 10 falhas é negociavel ou é requisito de contrato (FR-010)?
  - Existe monitoramento/alerting para lockouts repetidos do mesmo email?

**Resolução (2026-08-14):**

- **Perguntas em aberto respondidas:**
  - **Chaveamento: (email + IP).** Fingerprint de dispositivo foi rejeitado — exigiria JS no cliente (o repo não tem frontend) e é burlável com spoofing de headers; o IP já é coletado para rate limit e auditoria.
  - **Limiar de 10 falhas:** mantido como contrato (FR-016) para a camada por-(email+IP). A camada global usa um limiar novo (50), não coberto pela FR-016 original — a FR-016 foi atualizada para documentar as duas camadas.
  - **Monitoramento/alerting:** não existe infra de observabilidade no repo; cada lockout continua logado com `logger.warn`, agora com a camada no contexto. Alerta de lockouts repetidos fica dependente de infra futura.
- **Decisão:** lockout em **duas camadas** (prática recomendada pelo OWASP Authentication Cheat Sheet):
  1. **Por (email + IP)** — 10 falhas do mesmo IP para o mesmo email → lock de 30min para esse par. Fecha o DoS do AUD-02: as 10 falhas de um atacante com IP rotativo não bloqueiam a vítima (IP diferente). O brute-force "clássico" de um único IP continua travado no limiar da FR-016.
  2. **Global por email** — 50 falhas totais (qualquer IP) → lock de 30min para todos. Preserva o teto da FR-016 contra brute-force distribuído (rotação de IPs) e encarece o DoS 5x: a 5 req/min do rate limit por email (FR-010), 50 tentativas levam ≥10min para cada lock de 30min.
- **Correção aplicada:**
  - `server/utils/shared/security.ts` — `evaluateLockout` ganhou parâmetro `maxAttempts` (default 10, FR-016); `checkAccountLockout`/`recordFailedAttempt`/`resetFailedAttempts` recebem `ip` opcional e operam nas duas chaves `lockout:<email>` (global) e `lockout:<email>:<ip>` (par), cada uma em transação `FOR UPDATE` própria (anti-TOCTOU preservado); sem IP (sem socket) apenas a camada global atua. Linhas `lockout:<email>` pré-existentes no banco passam a valer como camada global (contadores ≤10 migram para o limiar de 50; locks ativos expiram em 30min).
  - `server/api/auth/login.post.ts` — IP resolvido uma vez no início do handler (mesmo padrão try/catch do `checkIpRateLimit` para eventos sem socket) e propagado às três funções; auditoria e `sendDeactivationNotice` inalterados.
  - `specs/001-auth-context/spec.md` — FR-016 (e FAQ) atualizada com as duas camadas.
- **Garantias verificadas (testes + banco real):** 10 falhas do IP A → `account_locked` para (email, A), mas login normal para a vítima no IP B (o DoS é fechado); 50 falhas com IPs rotativos → lock global para qualquer IP; desbloqueio após 30min e `resetFailedAttempts` limpam as duas chaves; sem IP → 10 falhas não travam nada (abaixo do limiar global).
- **Risco residual declarado:** DoS distribuído de verdade (botnet) ainda pode manter a vítima bloqueada por 30min a cada 50 tentativas (≥10min de disparo contínuo a 5 req/min) — eliminar por completo exigiria CAPTCHA/verificação por email no login, fora de escopo. O IP é a âncora do par — com `TRUST_PROXY` mal configurado o par seria forjável (mitigado pelo fail-closed do AUD-05, `server/utils/shared/ip.ts`).
- **Testes:** `security.spec.ts` (limiar global via `maxAttempts`), `security.test.ts` (par não bloqueia outros IPs, lock global com IPs rotativos, unlock/reset nas duas chaves, sem-IP → só camada global), `login.post.spec.ts` (IP propagado às três funções). Suíte completa: 250 testes, lint limpo.

---

### AUD-03 — Enumeração de contas no registro

- **Categoria:** enumeração
- **Severidade:** média — exploração trivial (uma requisição), impacto de disclosure de existência de conta; agravado pelo contexto LGPD e pela interação com AUD-05.
- **Localização:** `server/utils/auth/identity/repository.ts` (`register`, catch do 422 e pós-check do usuário sintético); `server/api/auth/register.post.ts`
- **Descrição:** O registro devolve 409 explícito quando o email já existe. O login foi desenhado com anti-enumeração cuidadosa (401 genérico), mas o registro vaza existência de contas com uma chamada anônima.
- **Impacto / exploração:** Atacante enumera a base de usuários do sistema (validação de listas de emails). Combinado com AUD-05, também permite bloquear permanentemente o dono real de um email.
- **Status:** resolvido (commit `fix(auth): generic 201 on duplicate email registration (AUD-03)` — ver `git log --grep="AUD-03"`)

**Resolução (2026-08-10):**

- **Descobertas da investigação:**
  - O local real do vazamento não era `register.post.ts:52` (como descrito originalmente), e sim `server/utils/auth/identity/repository.ts` (`register`, catch do 422 → 409 "Email already registered").
  - Com `autoSignIn=false` (`shared/auth.ts:31`), o better-auth **já** responde com um usuário sintético (nunca persistido) para email duplicado, hasheando a senha no caminho para igualar o timing — o mapeamento 422→409 era **código morto**, mas uma mina armada: voltaria a vazar existência se a config mudasse (ex.: `requireEmailVerification` no fluxo de verificação, AUD-04).
  - O usuário sintético atravessava o handler e gravava eventos `registration` **fantasma** em `auth_event` com userId falso.
  - Assunção validada: não existe frontend dependente do código `conflict`/409 (o repo não tem páginas — apenas `app/app.vue` placeholder).
- **Correção aplicada:**
  - `server/utils/auth/identity/repository.ts` — `register()` passou a retornar `Promise<UserResult | null>`; o catch do 422 devolve `null` em vez de lançar 409, e um pós-check `findByEmail` detecta o usuário sintético do better-auth por id inexistente e devolve `null` (tratamento **config-independente** do email duplicado). `generateUserId()` (id sintético no formato do better-auth, 32 chars alfanuméricos) foi extraído para este módulo — a extração expôs um bug latente (`crypto.randomBytes` chamado como global, que quebraria o caminho duplicado em produção).
  - `server/api/auth/register.post.ts` — resposta 201 **incondicional**, corpo idêntico nos dois caminhos (id sintético, email/name derivados do input, `createdAt` atual); `createAuthEvent` só é disparado quando uma conta foi realmente criada (auditoria limpa).
  - `specs/001-auth-context/contracts/auth-api.md` — linha `409 conflict` removida do contrato do register; documentado o 201 genérico incondicional.
- **Garantias verificadas (testes + banco real):**
  - Status e corpo da resposta idênticos para email novo e já registrado (201, mesmo shape, conteúdo derivado do input).
  - Nenhuma conta duplicada criada nem conta existente sobrescrita — inclusive com `consentTermsVersion` enviado no caminho duplicado (o registro original fica intacto).
  - Nenhum evento `registration` fantasma em `auth_event`.
  - A garantia não depende da config atual do better-auth: email duplicado → `null` tanto via 422 quanto via pós-check do sintético.
- **Testes:** integração em `server/utils/auth/identity/repository.test.ts` (duplicado → `null`, conta original intacta, consentimento intocado) + unit em `server/api/auth/register.post.spec.ts` (201 idêntico no caminho duplicado, sem `createAuthEvent`; audit presente no caminho de sucesso).
- **Residual de timing (medido em localhost, 2026-08-10):** o custo dominante (hash de senha) é igualado pelo better-auth em ambos os caminhos; o resíduo é um único INSERT+fsync de COMMIT no caminho novo — medido em 4 runs com ~12 amostras cada: deltas de mediana de 6.1ms, 5.9ms, 3.9ms e 6.2ms, com ruído run-a-run de ±5ms (uma rodada do `signUpEmail` puro chegou a medir -0.8ms). Duas tentativas de equalização sem efeito colateral foram testadas e rejeitadas com dados: (1) INSERT `ON CONFLICT DO NOTHING` no índice único — sem efeito (a tentativa não paga WAL); (2) `pg_logical_emit_message` — resultado ambíguo (residual 3.4ms num run ruidoso) e introduz dependência de API PG obscura no caminho crítico de auth (falha → 503, quebrando a própria garantia). Conclusão: o resíduo está no piso do ruído de medição, abaixo do jitter de RTT em qualquer deploy real, e na mesma classe do AUD-07 (severidade baixa); equalização total exigiria escrita persistente com efeito colateral (linhas-lixo) — rejeitada por ser menos segura que o próprio resíduo.

---

### AUD-08 — Open redirect no link de reset de senha (`callbackURL` da query)

- **Categoria:** phishing / exfiltração de token
- **Severidade:** baixa — o link do email é seguro (`redirectTo: baseURL` server-side); a falha é no handler de clique, que confiava no `callbackURL` da query.
- **Localização:** `server/api/auth/reset-password/[token].get.ts`
- **Descrição:** o GET aceitava qualquer `callbackURL` e redirecionava (302) para a origem dele com `?token=...` na URL — open redirect no domínio confiável; com um token válido, o token vazava na URL do destino atacante.
- **Status:** resolvido (2026-08-14)
- **Correção:** allowlist de origens (`BETTER_AUTH_URL` + `CORS_ORIGIN`); origem estranha/malformada → fallback para a origem padrão. Testes: origem estranha rejeitada, `CORS_ORIGIN` aceito, path arbitrário reduzido à origem, sem callbackURL → padrão. Registro em `docs/pendencies.md` (item 19).

---

### AUD-04 — Ausência de verificação de email e de fluxo de recuperação de senha

- **Categoria:** produto-LGPD
- **Severidade:** média — bloqueio permanente do dono real do email; exposição legal/operacional no contexto LGPD.
- **Localização:** `server/api/auth/register.post.ts` (fluxo completo); `server/utils/auth/identity/repository.ts:106` (`register`); inexistência de endpoint de reset/verificação em `server/api/auth/`
- **Descrição:** O registro cria conta sem verificar posse do email (`email_verified=false`), o login não exige verificação, e não existe fluxo de "esqueci minha senha" nem de reativação de conta desativada.
- **Impacto / exploração:** Atacante pré-registra o email de um terceiro → o dono real recebe 409 para sempre (sem reset de senha, sem reativação). Usuários que perdem a senha ficam sem recuperação. Em contexto LGPD, o titular fica sem canal de acesso aos próprios dados.
- **Status:** resolvido
- **Perguntas em aberto:**
  - Verificação de email é requisito desta feature ou de um contexto futuro (onboarding)?
  - Quem decide a política: produto ou compliance? Existe definição formal de quando o bloqueio pré-registro é aceitável?
  - Como a pendência #12 (fila de deleção/anonymização) se relaciona com contas pré-registradas?

**Resolução (2026-08-14):**

- **Decisões de política (aplicadas, mas reversíveis por produto):**
  - Verificação de email **obrigatória** para login com senha: `requireEmailVerification: true` (melhor recuperação do que blocking — sem precedente de risco equivalente identificado).
  - `sendOnSignUp: true` — email verificação no registro. `sendOnSignUp` da conta pré-registrada (terceiro que registrar email de outrem) é um email de confirmação da posse, no escopo de uso informado dos dados.
  - `sendOnSignIn: true` — email de verificação reenviado **só após a senha correta** (posse do email não é testável por anônimos — sem vetor de spam) e **só se não verificada** (melhora do `sendVerificationEmail` nativo, que envia sem checar). Sem data migration: contas existentes com `email_verified=false` recebem o link na primeira tentativa de login com senha correta.
  - Recuperação de conta pré-registrada **sem censura à senha**: `requestPasswordReset` + `resetPassword` completos para qualquer conta com senha — um atacante pré-registrado só perde a conta (nunca o email), e o dono real recupera por reset de senha (email de verificação cobre ambos os fluxos).
  - **Fora de escopo (deliberado):** reativação de contas desativadas por retirada de consentimento (ato LGPD deliberado; resolver via suporte/anonimização #12); email `onExistingUserSignUp` (vetor de spam anônimo — qualquer um pode disparar emails a terceiros; os fluxos de verify/reset cobrem o valor de produto sem o vetor).
- **Correção aplicada:**
  - `shared/auth.ts` — `emailAndPassword.requireEmailVerification: true`, `sendResetPassword` (link do app, fire-and-forget via `void` — nunca atrasa o request nem falha o fluxo; equalização de timing AUD-03/AUD-07 preservada), `resetPasswordTokenExpiresIn: 3600`, `revokeSessionsOnPasswordReset: true`; `emailVerification.sendVerificationEmail` com `sendOnSignUp: true`, `sendOnSignIn: true`, `expiresIn: 3600`.
  - Novos endpoints em `server/api/auth/`: `send-verification-email.post.ts`, `verify-email.get.ts` (302 para origin sem estado), `forget-password.post.ts`, `reset-password.post.ts` (token no body **ou** query, idempotente entre os dois canais), `reset-password/[token].get.ts` (valida sem consumir → 302 com `?token=` ou `?error=INVALID_TOKEN`). Rate limit por IP + por email (5/min) em todos.
  - `server/utils/auth/identity/repository.ts` — `verifyEmail`, `sendVerificationEmail`, `requestPasswordReset`, `resetPassword` (wrap 400/401 em 400 genérico — token inválido/expirado/consumido indistinguíveis), `validateResetToken` (lookup drizzle na tabela `verification` do better-auth — acoplamento ao layout interno documentado no código); login: 403 `email_not_verified` repassado **só** com senha correta (sempre 401/403 genérico antes disso — sem enumeração), e **excluído do lockout** (`LOCKOUT_EXEMPT_ERROR_CODES`).
  - `server/utils/shared/email.ts` — `sendTransactionalEmail` genérico (best-effort, nunca lança) + `sendVerificationEmailLink`/`sendPasswordResetLink` (Resend). Os links do better-auth já apontam para `/api/auth/...` (o `baseURL` do contexto inclui o basePath); só o `callbackURL` padrão é removido do link de verificação.
- **Garantias verificadas (testes + banco real):** registro envia link de verificação e login é bloqueado (403 `email_not_verified`) até verificar; replay do link de verificação é idempotente (token JWT de 1h); token de reset é de **uso único** (replay → 400) e `validateResetToken` não o consome; reset revoga **todas** as sessões; senha antiga inválida / nova aceita; `requestPasswordReset` de email inexistente resolve silenciosamente (anti-enumeração, sem email capturado); **takeover de pré-registro**: dono real recupera via reset + verificação e faz login — o atacante perde a conta; token de verificação forjado rejeitado. 295 testes no total (250 baseline + 45).
- **Risco residual declarado:** o login de conta **desativada** com senha correta continua retornando 401 genérico (AUD-06) — sem canal de recuperação; mitigado por suporte. Verificação por email depende da entrega (Resend) e de o titular ter acesso à caixa; melhorada por `sendOnSignIn` em cada login subsequente.
- **Dependências de deploy:** `RESEND_API_KEY`/`RESEND_FROM` (mesmas envs do AUD-06; sem elas os emails são pulados com warning e a verificação nunca se completa — nova conta fica bloqueada em 403; logado no sistema de monitoramento do AUD-06).
- **Perguntas em aberto:**

---

### AUD-05 — Configuração de infraestrutura (SSL, IP spoofing, fallbacks de env)

- **Categoria:** infraestrutura
- **Severidade:** média — risco depende do ambiente de deploy; se o deploy não estiver blindado, os três itens são exploráveis.
- **Localização:** `server/utils/db.ts:6` (sem `sslmode=require`); `server/utils/shared/ip.ts:6` (`TRUST_PROXY`); `shared/auth.ts:7` e `nuxt.config.ts:24` (fallback `localhost`)
- **Descrição:**
  1. `postgres(connectionString)` sem `sslmode=require` — tráfego de banco em claro se a URL de produção não travar SSL.
  2. `TRUST_PROXY=true` sem um proxy real reescrevendo `X-Forwarded-For` → o cliente falsifica o IP: burla o rate limit por IP (AUD-02 fica trivial) e polui auditoria de eventos com IPs falsos.
  3. `CORS_ORIGIN` e `BETTER_AUTH_URL` com fallback silencioso para `localhost` quando a env falta — produção pode operar com origem/URL erradas sem nenhum erro.
- **Impacto / exploração:** Leitura de dados no tráfego DB (se sem TLS), bypass de rate limiting e auditoria inválida (se TRUST_PROXY mal configurado), CORS/origin incorretos em prod (se env ausente).
- **Status:** resolvido

**Resolução (2026-08-11):**

- **Decisões:** as três brechas foram fechadas em modo fail-closed, sem alterar o comportamento de dev/CI (`NODE_ENV` ≠ `production` continua intocado). Para o item 2, a validação de "proxy confiável" não é observável no boot (é propriedade de runtime), então o fechamento é dupla camada: exigir os CIDRs do proxy no boot (config) + verificar o peer imediato por request (runtime).
- **Correção aplicada:**
  - `server/utils/db.ts` — `withRequiredSsl()`: em produção, força `sslmode=require` na connection string quando ausente ou fraca (`disable`/`no`/`allow`/`prefer`); respeita `require`/`verify-ca`/`verify-full` explícitos na URL do deploy. O postgres-js mapeia `sslmode` → opção `ssl`; default sem o parâmetro era `ssl: false` (plaintext total em prod, o furo real). Dev local (postgres docker sem TLS) inalterado. Nota documentada: `sslmode=require` criptografa sem pinning de CA — deploy que exija verificação deve fixar `sslmode=verify-full` na própria `DATABASE_URL`.
  - `server/utils/shared/ip.ts` — `TRUST_PROXY` passou a exigir `TRUSTED_PROXY_CIDRS` (lista de CIDRs, ex.: `10.0.0.0/8`): `X-Forwarded-For` só é honrado se TRUST_PROXY=true **e** o peer imediato (`socket.remoteAddress`) estiver nos CIDRs, via `net.BlockList` (stdlib). CIDR malformado → throw na carga do módulo (visível até em dev); peer IPv4-mapped (`::ffff:`) normalizado antes do match. Sem CIDRs → header sempre ignorado (fail-closed).
  - `server/plugins/validate-env.ts` (novo) — plugin nitro que roda no boot do servidor: com `NODE_ENV=production`, throw (processo não sobe, fail-fast) se `CORS_ORIGIN`, `BETTER_AUTH_URL` ausentes, ou `TRUST_PROXY=true` sem `TRUSTED_PROXY_CIDRS`.
  - `nuxt.config.ts` — throw no build se `NODE_ENV=production` e `CORS_ORIGIN` ausente: o header CORS é baked no build pelo Nitro, então o plugin de runtime não conseguiria pegar esse caso sozinho.
  - `.env.example` — `TRUSTED_PROXY_CIDRS` documentada (obrigatória quando `TRUST_PROXY=true`).
- **Garantias verificadas (testes):** `server/utils/shared/ip.spec.ts` (default não confia; confia só com flag + peer no CIDR; fail-closed para peer fora da lista e para flag sem CIDRs; normalização IPv4-mapped; IP único sem prefixo; valores ≠ `true` ignorados; CIDR malformado lança), `server/utils/db.spec.ts` (prod força/upgrade/respecta sslmode; fora de prod URL intocada), `server/plugins/validate-env.spec.ts` (nada fora de prod; lista de ausentes em prod; TRUST_PROXY=true com/sem CIDRs; malformado lança).
- **Risco residual declarado:** `sslmode=require` não valida certificado (equivalente ao libpq `require`); e os CIDRs não podem provar que _há_ um proxy reescrevendo o header — um atacante com acesso à rede das origens confiadas conseguiria forjar o header. Ambos resolvem com deploy blindado (CA pinning via `verify-full` e regra de firewall para os CIDRs).
- **Dependências de deploy:** produção precisa setar `CORS_ORIGIN`, `BETTER_AUTH_URL`, e — se atrás de proxy — `TRUST_PROXY=true` + `TRUSTED_PROXY_CIDRS`; o Postgres de prod precisa aceitar TLS (senão o boot de conexão falha, intencional). Desde 2026-08-14 o `docker-compose.prod.yml` piná a subnet da `merp_network` em `172.28.0.0/16` e já define `TRUSTED_PROXY_CIDRS=172.28.0.0/16` no serviço `app` — o gap que fazia o boot de produção ser recusado (env ausente) está fechado no próprio compose.
- **Perguntas em aberto:**
  - O deploy de produção termina TLS onde (proxy/load balancer vs. conexão direta ao Postgres remoto)?
  - O fallback para `localhost` é observável em produção hoje (há monitoramento de env)?
  - Devemos falhar (fail-closed) na inicialização quando env obrigatória estiver ausente em produção?

---

### AUD-06 — Vazamento de `account_deactivated` no login

- **Categoria:** enumeração
- **Severidade:** baixa — vaza apenas a existência de contas desativadas; comportamento deliberado e documentado no código.
- **Localização:** `server/api/auth/login.post.ts:19` (`REPASSED_LOGIN_ERROR_CODES`), `:113-115` (rethrow de `account_deactivated`)
- **Descrição:** O login repassa o código `account_deactivated` ao cliente, enquanto demais falhas retornam 401 genérico "Invalid email or password". A distinção permite confirmar que um email existe e foi desativado.
- **Impacto / exploração:** Enumeração direcionada (qual email pertence a conta desativada). Requer que o atacante adivinhe emails; utilidade marginal.
- **Status:** resolvido (commit `fix(auth): mask account_deactivated and notify owner by email (AUD-06)` — ver `git log --grep="AUD-06"`)
- **Perguntas em aberto:**
  - O requisito de feedback para conta desativada é imutável, ou o mascaramento pode ser estendido com um canal alternativo (e.g., email de reativação)?
  - Existe fluxo de reativação planejado que torne o código observável útil?

**Resolução (2026-08-11):**

- **Decisão:** opção (b) aprovada — a resposta HTTP do login para conta desativada passou a ser o mesmo 401 genérico das demais falhas (fecha o vazamento; alinhado ao padrão OWASP "account disabled" como mensagem de erro incorreta e ao comportamento default do AWS Cognito), e o feedback explícito ao dono migrou para um email automático (canal privado), via Resend.
- **Correção aplicada:**
  - `server/api/auth/login.post.ts` — branch `account_deactivated` não repassa mais o erro: dispara `sendDeactivationNotice(email)` **fire-and-forget** (`void`, sem await — preserva o timing equalizado do AUD-07; um await no Resend adicionaria ~100-500ms ao caminho desativado, reintroduzindo o oráculo de timing) e devolve `sendUnauthorizedError('Invalid email or password')`. Premissa documentada no código: fire-and-forget depende do processo Node persistir após a resposta — não é seguro em presets serverless/edge (deploy atual: processo persistente na Hetzner).
  - Renomeado `REPASSED_LOGIN_ERROR_CODES` → `LOCKOUT_EXEMPT_ERROR_CODES`: o Set não marca mais codes "seguros de expor ao cliente", apenas os isentos de lockout por-email (uso em `:109`); o `reason` `account_deactivated` continua na auditoria interna (`failed_login`) e continua sem contar para lockout.
  - `server/utils/shared/email.ts` (novo) — `sendDeactivationNotice(email)`: POST `https://api.resend.com/emails` com `fetch` nativo (sem SDK), timeout 5s via `AbortController`, best-effort (sem key → warn + skip; qualquer erro → log, nunca lança; sem fila/retry).
  - `specs/001-auth-context/contracts/auth-api.md` — linha `401 account_deactivated` removida; 401 genérico documentado com nota do email automático.
  - `.env.example` — `RESEND_API_KEY`/`RESEND_FROM` documentados (ausência → email pulado com warn, login inalterado).
- **Risco residual declarado (não corrigido nesta rodada):** o branch `account_deactivated` é isento de lockout por-email (`:109`), então um atacante que conheça o email de uma conta desativada pode gerar disparos repetidos do email de aviso, limitado apenas pelo rate limit por IP existente (20/min, contornável por rotação de IP). Revisado com o AUD-02 (2026-08-14): o chaveamento do lockout não cobre este gap (o envio de email fica fora do lockout por design — conta desativada não deve bloquear o dono); mitigação de spam de email segue como gap conhecido, dependente de infra de fila/rate limit de envio.
- **Testes:** unit `server/utils/shared/email.spec.ts` (payload/headers corretos, skip sem key, erro do Resend não lança) + `server/api/auth/login.post.spec.ts` (401 genérico no caminho desativado, `sendDeactivationNotice` chamado com o email, reason `account_deactivated` na auditoria, sem failed attempt). Suíte completa: 229 testes, lint limpo.

---

### AUD-07 — Side-channel de timing no `signIn` para contas desativadas

- **Categoria:** enumeração
- **Severidade:** baixa — diferença de timing pequena e difícil de medir de forma confiável pela rede.
- **Localização:** `server/utils/auth/identity/repository.ts` (`signIn`)
- **Descrição:** O `signIn` executa `findByEmail` (query no banco + check de `isActive`) antes de chamar `authInstance.api.signInEmail`. A investigação revelou que a assimetria real era a oposta à hipótese original: conta **desativada** lançava `account_deactivated` antes de `resolveAuth()` + `signInEmail`, sem nunca pagar a query `findUserByEmail` do better-auth nem o scrypt (~50-150ms) — um oráculo de enumeração ~15x mais rápido que os demais caminhos.
- **Impacto / exploração:** Enumeração de contas existentes via medição de tempo, complementar a AUD-03/AUD-06. Requer amostragem estatística; baixo risco prático.
- **Status:** resolvido (commit `fix(auth): equalize sign-in timing for deactivated accounts (AUD-07)` — ver `git log --grep="AUD-07"`)

**Resolução (2026-08-10):**

- **Descobertas da investigação:**
  - O pré-check `findByEmail` roda incondicionalmente para qualquer email (`repository.ts:169`) — o check `isActive` é JS puro, sem query extra. Não existe "branch com query extra vs. sem query" entre email existente e inexistente.
  - A assimetria estrutural dominante: conta desativada nunca passava pelo better-auth — não pagava `findUserByEmail` nem o scrypt. O hasher padrão do better-auth é scrypt (`@better-auth/utils/password`, N=16384/r=16/p=1, pure JS) com `hash` ≈ `verify` em custo (uma invocação de scrypt cada). Medido em localhost: desativado ≈ 5ms vs. email inexistente ≈ 65ms — diferença de ~13x, o oráculo mais forte dos três.
  - Email ativo vs. inexistente: resíduo de ~1-5ms (INSERT de sessão no caminho de sucesso) — mesma classe do resíduo aceito no AUD-03 (6ms, no piso do ruído).
- **Correção aplicada:**
  - `server/utils/auth/identity/repository.ts` (`signIn`) — no branch `isActive === false`, o caminho agora paga o custo equivalente antes de lançar: chama `authInstance.api.signInEmail` com uma senha-pad determinística e impossível de acertar (`__aud07_timing_pad__`), via `withTimeout(…, 5_000)`, engole o 401 esperado (e qualquer erro/timeout do pad) e lança o `account_deactivated` de sempre. O verify de scrypt é determinístico — a chamada nunca cria sessão. Guarda de invariante: se o pad resolver (mudança futura de comportamento do better-auth), a sessão vazada é revogada (`terminateSession`) com warn antes do throw — a branch desativada **nunca** retorna sucesso nem vaza sessão.
  - Resultado: os três caminhos de falha pagam exatamente 2 queries + 1 scrypt; o resíduo restante é o INSERT de sessão do caminho de sucesso (~1-5ms).
  - Nuance documentada: com o better-auth indisponível, o caminho desativado também responde 503 `auth_unavailable` (antes: 401 mesmo com o BA fora) — falha de infraestrutura uniforme em todos os caminhos.
- **Sem mudança funcional:** cliente continua recebendo 401 `account_deactivated`; lockout/rate-limit intactos (o endpoint só conta `invalid_credentials` para lockout, e o pad produz `account_deactivated` — verificado por `login.post.spec.ts:382`); nenhuma sessão criada (verificado por teste de integração).
- **Testes:** unit `server/utils/auth/identity/repository.spec.ts` (pad chamado com senha ≠ da fornecida; guarda revoga sessão se o pad resolver; caminho de email inexistente recebe a senha real) + integração `server/utils/auth/identity/repository.test.ts` (nenhuma sessão criada após tentativa em conta desativada; os testes existentes de `account_deactivated` agora exercitam o pad).
- **Residual de timing (medido em localhost, 2026-08-10, 8 amostras por caminho):** medianas de 69.3ms (desativado), 65.2ms (email inexistente) e 65.6ms (ativo, senha errada) — delta de ~4ms, abaixo do jitter de RTT em qualquer deploy real e na mesma classe do resíduo aceito no AUD-03. O custo dominante (scrypt) agora é pago em todos os caminhos.

**Verificação (2026-08-11, sem alteração de código):**

- **Premissa do problema original re-avaliada contra o estado atual:** a hipótese de que `signInEmail` seria pulado para email inexistente ou conta desativada é falsa no código atual — o branch de desativado roda `signInEmail` com a senha-pad (0ff9052) e o email inexistente nunca é desviado do `signInEmail`.
- **Gap "existe vs não existe" (escopo original do AUD-07): fechado nativamente pelo Better Auth** — `signInEmail` (`better-auth@1.6.26`, `dist/api/routes/sign-in.mjs`) executa `password.hash(password)` — um hash scrypt dummy completo, mesmos parâmetros do verify (N=16384, r=16, p=1, `@better-auth/utils/password@0.4.2`) — antes do 401 quando `findUserByEmail` retorna null (e idem para `credentialAccount`/password ausentes). É o mesmo padrão de correção do CVE-2024-39329 (Django) e do AUD-03: o custo dominante (hash de senha) é pago mesmo sem usuário real pra comparar. Implementar um verify dummy próprio seria redundante.
- **Gap "ativa vs desativada/inexistente" (relacionado, não coberto por item da auditoria): fechado** — o pad do commit `0ff9052` faz o caminho desativado pagar o mesmo scrypt do caminho ativo (1 verify) e do inexistente (1 hash dummy). Medido: 69.3 / 65.2 / 65.6ms. **Sem risco residual declarado.**
- **Resíduo restante (aceito):** apenas o caminho de sucesso paga o INSERT de sessão (~1-5ms) — documentado acima, no piso do ruído.
- **Testes:** suíte completa verde (229 testes, 31 arquivos) — nenhum teste novo necessário por ausência de mudança de código.

---

## Contexto — O que já está resolvido (não são problemas)

| Item                                                                  | Referência                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| RLS com FORCE + backstop TOCTOU (owner reavaliado na execução)        | `drizzle/0007_abnormal_talkback.sql`, `drizzle/0009_company_delete_owner.sql` |
| Invites: UPDATE/DELETE restritos a owner (claim por token preservado) | `drizzle/0013_invite_owner_update.sql`                                        |
| `TRUSTED_PROXY_CIDRS` definida no prod compose (subnet pinada)        | `docker-compose.prod.yml` (AUD-05 deploy gap fechado, 2026-08-14)             |
| Escape de LIKE wildcards na busca de empresas                         | `server/utils/auth/company/repository.ts:13` (`escapeLikePattern`)            |
| Erro 500 genérico sem vazamento de detalhes internos                  | `server/error-handler.ts:46`                                                  |
| Rate limit por IP antes do `readBody` (corpos grandes sem parse)      | `server/api/auth/login.post.ts:37`, `server/api/auth/register.post.ts:13`     |
| `FOR UPDATE` + transação no rate limit e lockout (anti-TOCTOU)        | `server/utils/shared/security.ts:87,157`                                      |
| CSRF mitigado (sameSite=lax, mutações só POST, CORS de origem única)  | `shared/auth.ts:46`, `nuxt.config.ts:21-31`                                   |
| Purge de `auth_security_state` (crescimento sem limite)               | `server/tasks/purge-security-state.ts`, `nuxt.config.ts:17`                   |
| Anti-enumeração no login: `account_locked` mascarado, 401 genérico    | `server/api/auth/login.post.ts:53-62`                                         |
| IP spoofing mitigado por default (`TRUST_PROXY=false`)                | `server/utils/shared/ip.ts:6`                                                 |

---

## Priorização sugerida (severidade x facilidade de exploração)

Ordem de prioridade para planejamento de correção, combinando impacto e custo de exploração:

1. **AUD-03 (enumeração no register)** — exploração trivial (1 requisição), baixo esforço de correção, melhora imediata do perfil LGPD.
2. **AUD-02 (lockout DoS)** — **resolvido (2026-08-14)** — lockout em duas camadas keyed por (email+IP) no limiar da FR-016 e global por email em 50.
3. **AUD-05 (infra: sslmode, TRUST_PROXY, fallbacks de env)** — correção de configuração de baixo esforço, mas depende do conhecimento do ambiente de deploy.
4. **AUD-01 (token no convite)** — **resolvido (2026-08-11)** — aceite por token de uso único com backstop RLS. (Era o de maior impacto potencial; deixa o topo.)
5. **AUD-04 (verificação de email / reset de senha)** — alto impacto de produto/LGPD, mas é decisão de escopo (feature nova), não hotfix.
6. **AUD-06 (account_deactivated)** — impacto marginal; depende de decisão de produto sobre mascaramento.
7. **AUD-07 (timing side-channel)** — impacto marginal e exploração difícil; correção de menor prioridade.
