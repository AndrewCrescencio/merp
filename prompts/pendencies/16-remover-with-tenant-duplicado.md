Resolva a pendência #8 de `docs/pendencies.md` — remover `withTenant` duplicado em
`server/utils/auth/helpers.ts`.

### Contexto

Linhas 153-165 de `server/utils/auth/helpers.ts` contêm uma segunda implementação de
`withTenant` que cria uma conexão postgres nova por chamada. Não é usada em lugar nenhum —
o repositório importa de `./tenant-context.ts`.

### Alterações

1. Remova a função `withTenant` (linhas 153-165) de `server/utils/auth/helpers.ts`.
2. Remova os imports que ficarem sem uso (ex.: `postgres`, `drizzle-orm/postgres-js`,
   `* as schema`). Mantenha `H3Event`, `createError` e `logger`.

### Verificação

```bash
npm run lint
npm run format:check
npx vitest run server/
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
