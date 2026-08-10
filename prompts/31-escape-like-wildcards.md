Escapando curingas do usuário na busca por LIKE de empresas.

### Contexto

`searchCompanies` em `server/utils/auth/company/repository.ts` monta
`%${query}%` e usa `like(company.name, pattern)`. Os caracteres `%` e `_` do
usuário atuam como curingas — `q=%%` casa com qualquer string e `q=_` com
qualquer char único. Não é SQL injection (os valores são parametrizados), mas
amplia o resultado da busca além do termo digitado. O default do Postgres para
`LIKE` é escape com `\` — basta escapar os curingas no input, sem cláusula
`ESCAPE` extra nem mudança no drizzle.

### Alterações

1. Em `server/utils/auth/company/repository.ts` — extraia e exporte a função
   pura:

   ```typescript
   export function escapeLikePattern(query: string): string {
     return query.replace(/[\\%_]/g, (c) => `\\${c}`)
   }
   ```

   E use em `searchCompanies`:

   ```typescript
   const pattern = `%${escapeLikePattern(query)}%`
   ```

   (a chave `%` no padrão externo é intencional — continua substring match).

### Testes

- Unit spec `server/utils/auth/company/repository.spec.ts` (co-localizado,
  lógica pura, sem DB — o padrão do repo é `.test.ts` para integração): com
  `%`, `_` e `\` no input, o padrão retornado/gerado não contém curingas ativos
  (ex.: `50%` → `50\%`, `_a` → `\_a`).

### Verificação

```bash
npx vitest run server/utils/auth/company/repository.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
