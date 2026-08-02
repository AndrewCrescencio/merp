> **ESTADO (2026-08-02):** ⏳ pendente — pendência #13 de `docs/pendencies.md`
> (movido de `prompts/pendencies/20`).

Resolva a pendência #13 de `docs/pendencies.md` — error handler global (FR-026).

### Contexto

Não há handler global de erros do Nitro para capturar 500 inesperados e retornar o
formato padrão `internal_error`. Hoje erros não tratados podem vazar detalhes internos
(stack traces, mensagens de dependências).

### Alterações

1. Crie `server/error-handler.ts` exportando por default a função do handler
   (`defineNitroErrorHandler` de `nitropack` — import disponível como dependência
   transitiva, use `import { defineNitroErrorHandler } from 'nitropack'`):

   - Se o erro for um `createError`/`H3Error` com `message` em JSON no formato do
     contrato `{ error, message }` (status < 500), repasse intacto: `setResponseStatus`
     com o status do erro e `send(event, JSON.stringify(payload))`.
   - Para os demais (500 ou qualquer erro inesperado): `logger.error` (de
     `#shared/logger`) com `error.message`/`error.stack` para diagnóstico interno e
     responda **sem vazar detalhes**: status 500, corpo
     `{ "error": "internal_error", "message": "Internal server error" }`.
   - Não exponha `error.message` bruto nem stack traces na resposta.

2. Em `nuxt.config.ts`, dentro do bloco `nitro`, adicione:

```typescript
nitro: {
  errorHandler: '~/server/error-handler',
  // ...config existente
}
```

3. Extraia a lógica de decisão numa função pura exportada do mesmo arquivo
   (ex.: `normalizeError(error): { status: number; body: ApiError } | null`) para
   permitir teste unitário sem servidor. Se `error.message` for JSON válido com `error`
   e `message` e status < 500, devolve o payload; caso contrário, devolve
   `{ status: 500, body: { error: 'internal_error', message: 'Internal server error' } }`.

### Testes

- Spec co-localizado `server/error-handler.spec.ts`: erro com payload JSON do contrato é
  repassado; erro 500 genérico vira `internal_error` sem vazar mensagem; detalhe interno
  não aparece no corpo.

### Verificação

```bash
npx vitest run server/error-handler.spec.ts
npm run lint
npm run format:check
npm run dev  # manual: forçar um erro 500 em rota de teste e conferir o formato
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
