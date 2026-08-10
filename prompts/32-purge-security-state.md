Purge de `auth_security_state` (rate limit e lockout órfãos).

### Contexto

A tabela `auth_security_state` cresce sem limite: uma row por email
(`lockout:<email>`) e por IP (`rate:ip:<ip>`) que passa pelo login/register.
Nunca é limpa — `purge-sessions` cobre apenas `session`. Janelas de rate limit
expiram em 60s e lockouts em 30min; qualquer row com `updatedAt` mais antigo
que isso é lixo inerte.

### Alterações

1. Crie `server/tasks/purge-security-state.ts` seguindo o padrão de
   `server/tasks/purge-sessions.ts` (mesma estrutura de `defineTask`, logging,
   retorno `{ result, deletedCount }`):

   ```typescript
   const STALE_AFTER_MS = 24 * 60 * 60 * 1000 // folga: janela 60s, lockout 30min
   const cutoff = new Date(Date.now() - STALE_AFTER_MS)
   await db.delete(authSecurityState).where(lt(authSecurityState.updatedAt, cutoff))
   ```

2. Em `nuxt.config.ts` — registre no `scheduledTasks` (diário, junto com
   `purge-sessions`).

3. Sem teste automatizado: a lógica é um DELETE com WHERE trivial e o padrão
   do repo não tem spec para tasks (purge-sessions não tem). Verifique
   manualmente via task runner do nitro em dev.

Nota: a retenção de `auth_event` (emails + IPs) é decisão de negócio/LGPD —
continua fora de escopo (pendência #12, fila de deleção/anonymização).

### Verificação

```bash
npm run lint
npm run format:check
npm run dev  # manual: POST /_nitro/tasks/purge-security-state
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
