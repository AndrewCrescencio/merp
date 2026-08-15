# AUD-09 — Middleware de auth bloqueia os links de email (verify-email e reset-password)

**Data:** 2026-08-15
**Escopo:** `server/middleware/auth.ts`, `server/api/auth/verify-email.get.ts`, `server/api/auth/reset-password/[token].get.ts`, `server/api/auth/reset-password.post.ts`
**Objetivo:** Documentar falha de disponibilidade que neutraliza as garantias de AUD-04 (recuperação de conta) e AUD-03 (anti-enumeração). Nenhuma correção foi aplicada.

---

## AUD-09 — Middleware de auth bloqueia os links de email

- **Categoria:** disponibilidade (auth flow quebrado); agravante de segurança — neutraliza as mitigações de AUD-03/AUD-04.
- **Severidade:** crítica — bloqueia 100% dos fluxos de verificação de email e recuperação de senha; sem bypass possível pelo usuário.
- **Localização:** `server/middleware/auth.ts:8` (`publicRoutes`); endpoints afetados em `server/api/auth/verify-email.get.ts`, `server/api/auth/reset-password/[token].get.ts`, `server/api/auth/reset-password.post.ts`
- **Descrição:** O middleware de sessão (`server/middleware/auth.ts`) roda para toda requisição e só libera as rotas em `publicRoutes = ['/api/auth/register', '/api/auth/login', '/api/health', '/']`. Os destinos dos links gerados nos emails (configurados em `shared/auth.ts`) são rotas próprias do app e **não** estão na allowlist:
  - `GET /api/auth/verify-email?token=...` — link de verificação enviado no sign-up (`sendOnSignUp`) e reenviado no login (`sendOnSignIn`).
  - `GET /api/auth/reset-password/<token>` — link do email de reset (`sendPasswordResetLink`).
  - `POST /api/auth/reset-password` — chamado pela página de reset do frontend com o token na query/body.
- **Impacto / exploração:**
  - **Deadlock de verificação:** com `autoSignIn: false`, o usuário recém-registrado **não está logado**. Clica o link de verificação → middleware → `getSession` → null → 401. Tenta logar → 403 `email_not_verified` → `sendOnSignIn` reenvia o **mesmo link quebrado**. Nenhum usuário novo consegue verificar o email e ativar a conta.
  - **Reset de senha inoperante:** quem esqueceu a senha não está logado; o clique no link do email → 401, e o POST final também exige sessão. Não há caminho para definir nova senha.
  - **Neutraliza AUD-04/AUD-03:** a mitigação de pré-registro de email de terceiro (dono real recupera via verificação + reset) deixa de funcionar — o bloqueio pré-registro volta a ser permanente, e o usuário que perde a senha fica sem recuperação.
  - **Por que os testes não pegam:** os specs unitários chamam os handlers diretamente, sem passar pelo middleware (`verify-email.get.spec.ts:44`, `reset-password/[token].get.spec.ts:42`). O middleware só é testado isolado (`server/middleware/auth.spec.ts`), com uma allowlist que nunca é confrontada contra os links reais dos emails.
- **Status:** resolvido (2026-08-15)
- **Correção aplicada:**
  - `server/middleware/auth.ts` — `publicRoutes` ganhou `/api/auth/verify-email` e `/api/auth/reset-password` (cobre o POST com token na query/body); novo `publicRoutePrefixes = ['/api/auth/reset-password/']` cobre o GET dinâmico `/api/auth/reset-password/<token>` (o `includes` literal não casa o path com token — match por prefixo). As rotas continuam protegidas por rate limit por IP e pelo token de uso único/TTL 1h.
  - `server/middleware/auth.spec.ts` — 2 testes novos: verify-email e reset-password (GET com token e POST) pulam o middleware sem sessão (`getSession` não é chamado).
- **Verificação:** suíte completa verde (298 testes, 38 arquivos) + lint limpo. Não há teste de integração E2E de email (sem infra no repo) — a cobertura é o unit do middleware contra a lista real de rotas, que era o gap que deixou o bug passar.
- **Correção sugerida (registro histórico):** adicionar à `publicRoutes` as rotas que se autenticam pelo token da query/body (não pela sessão):
  ```ts
  const publicRoutes = [
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/verify-email',
    '/api/auth/reset-password',
    '/api/health',
    '/',
  ]
  ```
  Notas:
  - `POST /api/auth/reset-password` precisa ficar público: a página de reset do frontend roda **sem** sessão; a autenticação do fluxo é o próprio token (uso único, TTL 1h) + rate limit por IP já presente nos três endpoints.
  - Vale revisar se `GET /api/auth/reset-password/<token>` deve ser tratado como prefixo ou se a rota com `[token]` não é casada pelo `includes` — caminho é `/api/auth/reset-password/abc`, que **não** casa com a string literal; uma entrada exata não basta. Solução mais robusta: prefixo (`path.startsWith`) para as rotas públicas de fluxo.
- **Verificação necessária após correção:** teste de integração do fluxo completo passando pelo middleware: registro → clique no link de verificação (sem cookie de sessão) → 200/302; forget-password → clique no link de reset (sem sessão) → 302 com token; POST reset-password sem sessão → 200. E um teste que garanta que rotas privadas continuam 401 sem sessão.
