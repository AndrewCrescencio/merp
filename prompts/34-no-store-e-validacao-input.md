# Prompt 34 — AUD-17 + AUD-21 + AUD-22 + AUD-23: no-store PII e validação de input

## AUD-17 — GET com PII sem Cache-Control: no-store

- Novo server/middleware/no-store.ts: para qualquer request com pathname
  começando em /api/, setResponseHeaders(event, { 'cache-control':
  'no-store, no-cache, must-revalidate' }). Cobre também /api/health
  (no-store é inofensivo lá).
- NÃO duplicar nos handlers (me/export/invites.get) — o middleware cobre.
- Teste server/middleware/no-store.spec.ts: (1) /api/auth/me recebe o header;
  (2) / (raiz) não recebe; (3) headers mantidos em throw do handler.

## AUD-21 — tetos de tamanho em campos de empresa

server/utils/shared/security.ts: constantes MAX_COMPANY_NAME_LENGTH=200,
MAX_CNPJ_LENGTH=30, MAX_RAZAO_SOCIAL_LENGTH=200.

- server/api/auth/companies.post.ts: validar name ≤200, cnpj ≤30 (se presente),
  razaoSocial ≤200 — sendValidationError com mensagens claras.
- server/api/auth/companies.update.post.ts: mesmos tetos no input montado.
- Testes nos .spec.ts dos dois handlers (ex.: name 201 chars → 400).

## AUD-22 — email.includes('@') fraco

- Exportar `EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` de
  server/utils/shared/security.ts (hoje em server/api/auth/invite.post.ts:13).
- Usar em register.post.ts, forget-password.post.ts,
  send-verification-email.post.ts e invite.post.ts (remover a constante local).
- Ajustar os specs existentes se algum email de teste não casar o regex.

## AUD-23 — body types lax → 500

- login.post.ts: `typeof body.password !== 'string'` entra na validação
  (hoje só !body?.password) → sendValidationError.
- companies.post.ts: cnpj/razaoSocial com typeof !== 'string' → 400 (hoje
  TypeError → 500).
- Testes: spec do login com password numérico → 400; spec do companies.post
  com cnpj numérico → 400.

Verificação: pnpm test, pnpm lint. Commits:

1. fix(security): no-store em todas as rotas /api/ (AUD-17)
2. fix(auth): tetos de empresa, regex de email compartilhado, types no body (AUD-21/22/23)
