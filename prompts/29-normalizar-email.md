Corrija o bypass de rate limit, lockout e lookup por variação de caixa no email.

### Contexto

Rate limit (`rate:${email}`), lockout (`lockout:${email}`) e o lookup de usuário
(`findByEmail` com `eq` case-sensitive no Postgres) usam o email cru do body.
Consequências:

- `Foo@bar.com` e `foo@bar.com` são chaves diferentes → atacante rotaciona caixa
  para nunca bater o rate limit de 5/min por email nem o lockout de 10 falhas
  (o limite por IP é o único backstop).
- Registro permite criar **contas duplicadas** com caixa diferente para o mesmo
  mailbox (confusão de contas / possível sequestro via reset futuro).
- Usuário que registrou `Foo@bar.com` e loga com `foo@bar.com` recebe 401.

O `invite.post.ts` já normaliza (`.trim().toLowerCase()`) — sinal de que a
intenção é email case-insensitive; falta aplicar nos endpoints de identidade.

### Alterações

1. Em `server/utils/shared/security.ts` — adicione e exporte o helper:

   ```typescript
   export function normalizeEmail(email: string): string {
     return email.trim().toLowerCase()
   }
   ```

2. Em `server/api/auth/register.post.ts` — normalize logo após o `readBody` e
   use o valor normalizado em TODA a cadeia: validação, `checkRateLimit` e
   `identityRepository.register` (o email armazenado no DB fica minúsculo).

3. Em `server/api/auth/login.post.ts` — normalize logo após o `readBody` e use
   em `checkRateLimit`, `checkAccountLockout`, `recordFailedAttempt`,
   `resetFailedAttempts` e `signIn` (o `findByEmail` interno herda o fix).

4. Em `server/api/auth/invite.post.ts` — substitua o `.trim().toLowerCase()`
   inline pelo helper `normalizeEmail` (consistência).

5. **Migração de dados (opcional, só se já houver usuários reais)**: antes de
   aplicar, verifique duplicatas com

   ```sql
   SELECT lower(email), count(*) FROM "user" GROUP BY lower(email) HAVING count(*) > 1;
   ```

   Se houver, decida o dedupe manualmente; se não, um UPDATE
   `lower(email)` + índice único em `lower(email)` resolve o resíduo. Sem
   usuários em produção: pule (YAGNI — o normalize na escrita previne novos).

### Testes

- `server/api/auth/login.post.spec.ts` e `server/api/auth/register.post.spec.ts`:
  caso de caixa mista (`Foo@Bar.com`) — deve bater o mesmo rate limit/lockout e
  encontrar o mesmo usuário.
- Unit spec de `normalizeEmail` (`server/utils/shared/security.spec.ts`, junto
  dos testes existentes): trim + lowercase; email já minúsculo inalterado.
- Confirme que a chave de rate limit usa o email normalizado (se o spec mocka
  `checkRateLimit`, capture o argumento).

### Verificação

```bash
npx vitest run server/utils/shared/security.spec.ts server/api/auth/login.post.spec.ts server/api/auth/register.post.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
