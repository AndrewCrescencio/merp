# specs/000-foundation/endpoint-pattern.md

## Erro Padrão

```json
{
  "error": "codigo_erro",
  "message": "Mensagem legível para humano",
  "details": { "campo": "detalhe" } // opcional
}
```

## Rate Limits (consolidados em UM lugar)

| Escopo             | Limite     | Janela  | Header resposta                                             |
| ------------------ | ---------- | ------- | ----------------------------------------------------------- |
| IP                 | 20 req/min | sliding | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |
| Email              | 5 req/min  | sliding | —                                                           |
| User (autenticado) | 60 req/min | sliding | —                                                           |

Exceder → 429 com `Retry-After` em segundos.

## CSRF

Endpoints isentos (GETs + auth público):

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forget-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`
- `POST /api/auth/send-verification-email`
- Todos `GET`

Qualquer outro `POST/PATCH/DELETE` → exige `x-csrf-token` header.

## Versionamento

**`/api/v1` desde já.**  
Alternativa rejeitada: esperar primeiro consumidor externo (ADR-005).

## Paginação

Cursor-based: `?cursor=<opaque>&limit=<n>`.  
`cursor` = `base64url(created_at|id)` do último item da página anterior.  
Default `limit=50`, max `100`.

## Validação

**Zod** — schema nomeado por endpoint (`createOrderSchema`, `updateOrderSchema`, etc.).  
Reutiliza tipos Drizzle via `zod-drizzle` onde possível.  
Erro de validação → 400 com `details` por campo.
