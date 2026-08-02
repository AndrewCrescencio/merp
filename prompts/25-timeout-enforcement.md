> **ESTADO (2026-08-02):** ✅ resolvido (commit `13a3c72`). Pendência #11 de
> `docs/pendencies.md` implementada — `withTimeout` genérico com `Promise.race` +
> timer limpo em qualquer desfecho (`TimeoutError` distinto), `signIn`/`register`
> com 5s e 503 `upstream_timeout` em timeout, comentário para OAuth (10s) futuro.
> 65 testes passando, lint e format limpos.

Resolva a pendência #11 de `docs/pendencies.md` — timeout enforcement (FR-024).

### Contexto

FR-024 exige timeout de 5s para chamadas ao Better Auth e 10s para OAuth. Nenhum
wrapping de timeout existe nos métodos do repositório.

### Alterações

1. Em `server/utils/auth/helpers.ts`, adicione um helper genérico:

```typescript
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>
```

Implemente com `Promise.race` e um timer que rejeita após `ms`. **Importante:** o timer
deve ser limpo (`clearTimeout`) em qualquer desfecho para não vazar handles.

2. Em `server/utils/auth/repository.ts`:
   - `signIn` — envolva `auth.api.signInEmail(...)` com `withTimeout(..., 5_000)`.
   - `register` — envolva `auth.api.signUpEmail(...)` com `withTimeout(..., 5_000)`.
   - Em caso de timeout, lance `handleUpstreamTimeout()` (já existe em helpers.ts e
     retorna 503 `upstream_timeout`).
   - Mantenha o comportamento existente do `catch` (401 repassado, resto → `handleDatabaseError`).

3. OAuth (10s): nenhum provider OAuth está configurado ainda — deixe um comentário no
   repositório indicando que chamadas OAuth futuras devem usar `withTimeout(..., 10_000)`.
   Não implemente fluxo OAuth agora.

### Testes

- Crie `server/utils/auth/helpers.spec.ts` (ou use spec existente): `withTimeout`
  resolve quando a promise resolve antes do tempo; rejeita quando estoura; não vaza
  timer (fake timers do vitest).
- Atualize `server/utils/auth/repository.test.ts` se necessário (mocks de auth com
  atraso > 5s são opcionais — fake timers são preferíveis).

### Verificação

```bash
npx vitest run server/utils/auth/
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
