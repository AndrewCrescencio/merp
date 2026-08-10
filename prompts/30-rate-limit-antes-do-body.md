Aplique o rate limit por IP antes de ler o corpo da requisição.

### Contexto

Em `login.post.ts` e `register.post.ts`, `readBody` é chamado antes de
`checkRateLimit` — o corpo inteiro é parseado (memória/CPU) antes de qualquer
limite. Como login/register são rotas públicas e sem auth, um atacante pode
enviar POSTs grandes (dezenas de MB de JSON) para esgotar memória antes de
receber 429. Não há limite de tamanho de corpo no h3 1.15 (opções de
`readBody` só têm `strict`) nem `maxRequestBodySize` no nitropack 2.13.

### Alterações

1. Em `server/utils/shared/security.ts` — divida `checkRateLimit` em duas
   funções exportadas:

   - `checkIpRateLimit(event: H3Event): Promise<void>` — a parte atual de
     `rate:ip:<ip>` (não precisa do body; usa `getClientIp`).
   - `checkEmailRateLimit(event: H3Event, email: string): Promise<void>` — a
     parte atual de `rate:<email>`.

   Remova `checkRateLimit` (sem callers restantes) e ajuste os comentários.

2. Em `server/api/auth/login.post.ts` e `register.post.ts`:

   ```typescript
   await checkIpRateLimit(event)   // antes do readBody
   const body = await readBody<...>(event)
   // ... validação ...
   await checkEmailRateLimit(event, body.email)
   ```

3. Atualize os specs que mockam `checkRateLimit` (`login.post.spec.ts`,
   `register.post.spec.ts`) para as novas funções, incluindo um caso: IP no
   limite → 429 sem depender do corpo.

Nota: isso reduz o vetor a 20 corpos grandes/min por IP, não elimina —
o limite duro de tamanho de corpo é responsabilidade do proxy reverso
(ex.: `client_max_body_size` no nginx). Documente no `docker/README` ou
compose se houver; não adicione dependência.

### Testes

```bash
npx vitest run server/api/auth/login.post.spec.ts server/api/auth/register.post.spec.ts server/utils/shared/security.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
