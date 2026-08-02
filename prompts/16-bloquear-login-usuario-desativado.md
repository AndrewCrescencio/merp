> **ESTADO (2026-08-02):** ✅ implementado — commit `b8e2e0b`.
> Movido de `prompts/pendencies/09` (pendência #1 de `docs/pendencies.md`).
> `signIn` verifica `isActive` antes do Better Auth → 401 `account_deactivated`.
> Teste de integração em `repository.test.ts`.
> **Desvio:** mensagem "User has been deactivated" (EN, alinhada ao contrato
> `auth-api.md`) em vez de "Conta desativada." do rascunho.

Resolva a pendência crítica #1 de `docs/pendencies.md` — bloquear login de usuário desativado.

### Contexto

`deactivateUser()` define `isActive=false` e remove sessões, mas `signIn()` no repositório
não verifica `isActive` antes de chamar o Better Auth. Um usuário desativado consegue logar.

### Alterações em `server/utils/auth/repository.ts`

No método `signIn`, **antes** de chamar `auth.api.signInEmail()`, adicione:

```typescript
const existing = await this.findByEmail(input.email)
if (existing && !existing.isActive) {
  throw createError({
    status: 401,
    statusText: '401',
    message: JSON.stringify({
      error: 'account_deactivated',
      message: 'Conta desativada.',
    }),
  })
}
```

### Testes

Adicione um caso de integração em `server/utils/auth/repository.test.ts` (respeitando o
skip quando `process.env.DB_AVAILABLE === 'false'`): inserir um usuário com `isActive=false`
diretamente na base de teste e chamar `authRepository.signIn()` com esse email; esperar
rejeição com status 401 e código `account_deactivated`.

### Verificação

```bash
npx vitest run server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
