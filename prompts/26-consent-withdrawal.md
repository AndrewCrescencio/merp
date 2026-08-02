> **ESTADO (2026-08-02):** ⏳ pendente — pendência #12 de `docs/pendencies.md`
> (movido de `prompts/pendencies/19`).

Resolva a pendência #12 de `docs/pendencies.md` — consent withdrawal flow (FR-021).

### Contexto

O campo `consentWithdrawnAt` existe na tabela `user`, mas não há endpoint para retirar
consentimento, nem lógica de desativação. O data model diz que `consent_withdrawn_at`
dispara desativação + requisição de deleção. **Escopo:** implementar o withdraw com
desativação imediata; a fila de deleção/anonymização fica fora deste prompt.

### Alterações

1. Em `server/utils/auth/repository.ts`, adicione ao `IAuthRepository` e implemente:

```typescript
withdrawConsent(userId: string): Promise<UserResult>
```

Em transação (use `withTenant(null, userId, ...)`):

- `UPDATE user SET consentWithdrawnAt = now(), isActive = false, updatedAt = now()`
- `DELETE FROM session WHERE userId = userId` (encerra todas as sessões)

2. Crie `server/api/auth/consent/withdraw.post.ts` (padrão de `deactivate.post.ts`):
   - Auth obrigatório (401 se ausente).
   - Chama `authRepository.withdrawConsent(user.id)`.
   - Registra `auth_event` `consent_withdrawal` com metadata `{ consentWithdrawnAt }`.
   - Retorna `{ message: 'Consent withdrawn successfully' }`.

### Testes

- Spec co-localizado `server/api/auth/consent/withdraw.post.spec.ts` (mock do
  repositório): 401 sem sessão, sucesso.
- Caso de integração em `server/utils/auth/repository.test.ts`: após `withdrawConsent`,
  o usuário fica com `isActive=false`, `consentWithdrawnAt` preenchido e sem sessões;
  `signIn` rejeita com `account_deactivated` (interage com a pendência #1).

### Verificação

```bash
npx vitest run server/api/auth/consent/withdraw.post.spec.ts server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
