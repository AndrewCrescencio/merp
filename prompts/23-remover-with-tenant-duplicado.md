# 23 — Remover `withTenant` duplicado em `helpers.ts`

> **ESTADO (2026-08-02):** ✅ resolvido (commit `69f8c06`). Movido de
> `prompts/pendencies/16` (pendência #8 de `docs/pendencies.md`).

> **RESOLVIDO** — o bloco duplicado (linhas 153-165) e os imports sem uso
> (`postgres`, `drizzle-orm/postgres-js`, `* as schema`) foram removidos de
> `server/utils/auth/helpers.ts` em 2026-08-01. O warning de imports duplicados do
> build não ocorre mais. Documento histórico mantido para rastreabilidade.

## Contexto (histórico)

A pendência #8 de `docs/pendencies.md` — remover `withTenant` duplicado em
`server/utils/auth/helpers.ts`:

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
