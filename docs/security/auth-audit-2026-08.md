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
- **Status:** pendente
- **Perguntas em aberto:**
  - O fluxo atual (aceite por email + companyId, sem link) é uma escolha de UX deliberada ou interim?
  - Como o convidado descobre o `companyId` hoje para aceitar?
  - Um token secreto no convite quebraria algum contrato de API existente (`invites.get`, `invites.accept`)?

---

### AUD-02 — Lockout DoS por email

- **Categoria:** DoS
- **Severidade:** média — explorável hoje, sem nenhum bug, por qualquer atacante que conheça o email da vítima.
- **Localização:** `server/utils/shared/security.ts:151` (`checkAccountLockout`), `:18` (`MAX_FAILED_ATTEMPTS`), `:141` (`MAX_REQUESTS_PER_IP`)
- **Descrição:** A chave `lockout:<email>` é baseada apenas no email. O lockout é disparado após 10 falhas sem vínculo com o IP de origem. O rate limit por IP (20/min) é contornado com rotação de IPs.
- **Impacto / exploração:** Atacante com um IP rotativo faz 10 tentativas erradas para o email da vítima → conta bloqueada por 30min; repetindo, o bloqueio se torna permanente (logout forçado, login impossível). Não há alerta ou limite de lockouts repetidos.
- **Status:** mitigado parcialmente — o IP rate limit reduz o throughput, mas não impede rotação de IP.
- **Perguntas em aberto:**
  - O lockout deve ser keyed por (email + IP) ou (email + fingerprint de dispositivo)?
  - O limiar de 10 falhas é negociavel ou é requisito de contrato (FR-010)?
  - Existe monitoramento/alerting para lockouts repetidos do mesmo email?

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

### AUD-04 — Ausência de verificação de email e de fluxo de recuperação de senha

- **Categoria:** produto-LGPD
- **Severidade:** média — bloqueio permanente do dono real do email; exposição legal/operacional no contexto LGPD.
- **Localização:** `server/api/auth/register.post.ts` (fluxo completo); `server/utils/auth/identity/repository.ts:106` (`register`); inexistência de endpoint de reset/verificação em `server/api/auth/`
- **Descrição:** O registro cria conta sem verificar posse do email (`email_verified=false`), o login não exige verificação, e não existe fluxo de "esqueci minha senha" nem de reativação de conta desativada.
- **Impacto / exploração:** Atacante pré-registra o email de um terceiro → o dono real recebe 409 para sempre (sem reset de senha, sem reativação). Usuários que perdem a senha ficam sem recuperação. Em contexto LGPD, o titular fica sem canal de acesso aos próprios dados.
- **Status:** pendente
- **Perguntas em aberto:**
  - Verificação de email é requisito desta feature ou de um contexto futuro (onboarding)?
  - Quem decide a política: produto ou compliance? Existe definição formal de quando o bloqueio pré-registro é aceitável?
  - Como a pendência #12 (fila de deleção/anonymização) se relaciona com contas pré-registradas?

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
- **Status:** mitigado parcialmente — `TRUST_PROXY` default `false`; os outros dois itens são dependentes de deploy.
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
- **Status:** mitigado parcialmente — decisão de produto documentada (feedback claro ao dono da conta); `account_locked` já é mascarado.
- **Perguntas em aberto:**
  - O requisito de feedback para conta desativada é imutável, ou o mascaramento pode ser estendido com um canal alternativo (e.g., email de reativação)?
  - Existe fluxo de reativação planejado que torne o código observável útil?

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

---

## Contexto — O que já está resolvido (não são problemas)

| Item                                                                 | Referência                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| RLS com FORCE + backstop TOCTOU (owner reavaliado na execução)       | `drizzle/0007_abnormal_talkback.sql`, `drizzle/0009_company_delete_owner.sql` |
| Escape de LIKE wildcards na busca de empresas                        | `server/utils/auth/company/repository.ts:13` (`escapeLikePattern`)            |
| Erro 500 genérico sem vazamento de detalhes internos                 | `server/error-handler.ts:46`                                                  |
| Rate limit por IP antes do `readBody` (corpos grandes sem parse)     | `server/api/auth/login.post.ts:37`, `server/api/auth/register.post.ts:13`     |
| `FOR UPDATE` + transação no rate limit e lockout (anti-TOCTOU)       | `server/utils/shared/security.ts:87,157`                                      |
| CSRF mitigado (sameSite=lax, mutações só POST, CORS de origem única) | `shared/auth.ts:46`, `nuxt.config.ts:21-31`                                   |
| Purge de `auth_security_state` (crescimento sem limite)              | `server/tasks/purge-security-state.ts`, `nuxt.config.ts:17`                   |
| Anti-enumeração no login: `account_locked` mascarado, 401 genérico   | `server/api/auth/login.post.ts:53-62`                                         |
| IP spoofing mitigado por default (`TRUST_PROXY=false`)               | `server/utils/shared/ip.ts:6`                                                 |

---

## Priorização sugerida (severidade x facilidade de exploração)

Ordem de prioridade para planejamento de correção, combinando impacto e custo de exploração:

1. **AUD-03 (enumeração no register)** — exploração trivial (1 requisição), baixo esforço de correção, melhora imediata do perfil LGPD.
2. **AUD-02 (lockout DoS)** — explorável hoje sem bugs; correção exige decisão de chaveamento (email×IP) e possivelmente alteração de contrato (FR-010).
3. **AUD-05 (infra: sslmode, TRUST_PROXY, fallbacks de env)** — correção de configuração de baixo esforço, mas depende do conhecimento do ambiente de deploy.
4. **AUD-01 (token no convite)** — maior impacto potencial (autorização entre tenants), porém exige bug no app para exploração; correção provavelmente altera o fluxo de aceite (contrato/UX).
5. **AUD-04 (verificação de email / reset de senha)** — alto impacto de produto/LGPD, mas é decisão de escopo (feature nova), não hotfix.
6. **AUD-06 (account_deactivated)** — impacto marginal; depende de decisão de produto sobre mascaramento.
7. **AUD-07 (timing side-channel)** — impacto marginal e exploração difícil; correção de menor prioridade.
