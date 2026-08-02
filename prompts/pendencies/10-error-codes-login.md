> **ESTADO (2026-08-02):** ✅ implementado — commit `dcc3d97`.
> `checkAccountLockout` → 401 `account_locked`; catch do login repassa
> `account_locked`/`account_deactivated` e registra `metadata.reason` com o
> código; 401 genérico continua `unauthorized`. Specs atualizados.

Resolva a pendência crítica #2 de `docs/pendencies.md` — códigos de erro no login
(`account_locked` / `account_deactivated`).

### Contexto

O contrato em `specs/001-auth-context/contracts/auth-api.md` exige 401 com códigos
`account_locked` e `account_deactivated` no `POST /api/auth/login`, mas hoje o handler
retorna apenas `unauthorized` genérico.

### Alterações

1. Em `server/utils/auth/helpers.ts` — `checkAccountLockout` deve lançar 401 com código
   `account_locked` em vez de `unauthorized`. Use `sendAuthError(401, 'account_locked', ...)`.
2. Em `server/api/auth/login.post.ts` — no bloco `catch`, antes de cair no fallback genérico,
   verifique se o erro lançado carrega um dos códigos `account_locked` ou
   `account_deactivated` (o repositório/helpers lançam `createError` com `message` em JSON
   `{ error, message }`). Se o código for um desses, **repasse o erro como está** (não
   substitua pelo `unauthorized` genérico). Somente erros 401 sem código específico devem
   virar `unauthorized` com a mensagem 'Invalid email or password'.
3. No `catch`, o `metadata.reason` do evento `failed_login` deve refletir o código do erro
   quando ele for `account_locked` ou `account_deactivated`.

### Testes

Atualize `server/api/auth/login.post.spec.ts`:

- mock `checkAccountLockout` lançando erro 401 com código `account_locked` → o handler
  deve repassar o código `account_locked`.
- mock `signIn` rejeitando erro 401 com código `account_deactivated` (formato
  `createError` com `message` JSON) → o handler deve repassar `account_deactivated`.
- erro 401 sem código → mantém `unauthorized` genérico.

### Verificação

```bash
npx vitest run server/api/auth/login.post.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
