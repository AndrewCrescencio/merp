# 12 — Erros de RLS mapeados para 403 (P4)

> **ESTADO (2026-08-02):** ✅ implementado — commit `f098081`.
> ✅ `classifyDatabaseError` + `handleDatabaseError` distinguindo RLS (403) de
> indisponibilidade (503), com `logger.warn` para RLS e `logger.error` para 503.
> ✅ Testes em `helpers.spec.ts` (42501/P0001/embrulhado em cause → 403;
> conexão/ECONNREFUSED/23505 → 503; `handleDatabaseError` 403/503).
>
> **AMENDMENT (2026-08-02, pós-execução):** o código do plano lia
> `(error as { code?: string })?.code` direto, mas o drizzle 0.45 embrulha o erro
> do postgres em `DrizzleQueryError` (code em `cause.code`) — o mapeamento nunca
> dispararia. A implementação usa `getPostgresErrorCode(error)` (lê `code` ou
> `cause.code`), já existente e usada pelos conflitos 409.

## Contexto

`handleDatabaseError` em `server/utils/auth/helpers.ts` converte **qualquer** erro
de banco em `503 service_unavailable`. Violações de RLS (cross-tenant) disparam
códigos `42501` (insufficient_privilege) / `P0001` (erro em função de policy) e
viram 503 — mascarando o problema e confundindo debugging (e vazando ao cliente
que houve tentativa inválida como "serviço indisponível").

## Alterações

Em `server/utils/auth/helpers.ts`, modifique `handleDatabaseError` para distinguir:

```typescript
const RLS_ERROR_CODES = new Set(['42501', 'P0001'])

export function classifyDatabaseError(error: unknown): {
  status: number
  error: string
  message: string
} {
  const code = (error as { code?: string } | null)?.code

  if (code && RLS_ERROR_CODES.has(code)) {
    return {
      status: 403,
      error: 'forbidden',
      message: 'You do not have permission to access this resource',
    }
  }

  return {
    status: 503,
    error: 'service_unavailable',
    message: 'Service temporarily unavailable. Please try again later.',
  }
}

export function handleDatabaseError(error: unknown): never {
  const classification = classifyDatabaseError(error)

  logger[classification.status === 403 ? 'warn' : 'error']('Database error', {
    code: (error as { code?: string } | null)?.code,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })

  sendAuthError(classification.status, classification.error, classification.message)
}
```

**Notas:**

- Não expor a mensagem do driver ao cliente — logar internamente com `logger.warn`
  para RLS e `logger.error` para indisponibilidade.
- Não tentar diferenciar `42501` de outros privilégios: se o app está configurado
  certo, `42501`/`P0001` em tabela tenant-scoped significa tentativa cross-tenant.

## Testes

Criar/estender `server/utils/auth/helpers.spec.ts`:

1. `classifyDatabaseError` com `{ code: '42501' }` → 403 `forbidden`.
2. `classifyDatabaseError` com `{ code: 'P0001' }` → 403 `forbidden`.
3. `classifyDatabaseError` com erro de conexão (sem `code`) → 503.
4. `classifyDatabaseError` com `{ code: 'ECONNREFUSED' }` → 503.
5. `classifyDatabaseError` com `{ code: '23505' }` → 503 (não é RLS; conflitos são
   tratados em cada método antes).

## Verificação

```bash
npx vitest run server/utils/auth/helpers.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
