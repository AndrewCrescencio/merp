Resolva a pendência #7 de `docs/pendencies.md` — eventos de observabilidade do ciclo de
vida da sessão (FR-023).

### Contexto

A spec FR-023 exige os eventos `session_created`, `session_validated`,
`session_expired`, `session_invalidated` com session_id, user_id, tenant_id. Hoje apenas
`session_expired` é logado no middleware; os demais não são emitidos.

### Alterações

Registre os eventos na tabela `auth_event` via `authRepository.createAuthEvent` com
`metadata` incluindo `sessionId`, `userId`, `tenantId`:

1. **`session_created`** — em `server/utils/auth/repository.ts`, método `signIn`, após
   sucesso do `auth.api.signInEmail`. O resultado possui `session.id` e `user.id`;
   `tenantId` = `activeCompanyId` da sessão (pode ser null). Use `email` do resultado.
   Não deixe a falha do evento quebrar o login (fire-and-forget, sem `await` crítico).
2. **`session_validated`** — em `server/middleware/auth.ts`, após
   `auth.api.getSession` retornar sessão válida, registre o evento antes de setar
   `event.context`. Use `user.id`, `user.email`, `session.id` e
   `session.activeCompanyId` como tenantId.
3. **`session_expired`** — já logado via `logger.warn` no middleware quando existe cookie
   mas a sessão expirou. Além do log, registre `auth_event` `session_expired`. Emails de
   eventos anônimos: use o email do usuário se disponível no cookie de sessão não dá para
   obter — neste caso pode omitir `userId` e usar `email` vazio não é permitido (coluna
   NOT NULL); mantenha o evento somente quando houver `user` da sessão válida, ou use
   `email: 'unknown'` documentando a limitação. **Decida a abordagem mais segura e
   comente a decisão no código.**
4. **`session_invalidated`** — em `server/api/auth/logout.post.ts` e
   `server/api/auth/deactivate.post.ts`, após encerrar a sessão, registre o evento com
   `sessionId` quando disponível (no logout, pegue `event.context.session.id`).

O data model lista event_types permitidos em `auth_event`; estenda essa lista com os
novos tipos se necessário.

### Testes

- Atualize `server/middleware/auth.spec.ts` para cobrir a emissão de
  `session_validated` e `session_expired`.
- Atualize `server/api/auth/logout.post.spec.ts` e `deactivate.post.spec.ts` para cobrir
  `session_invalidated`.

### Verificação

```bash
npx vitest run server/middleware/ server/api/auth/logout.post.spec.ts server/api/auth/deactivate.post.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
