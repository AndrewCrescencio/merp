# Prompt 33 — AUD-15 + AUD-16: rate limit do nginx e por usuário

Corrija dois achados da auditoria docs/security/security-audit-2026-08-18.md.
Siga o padrão do repo: testes co-locados (unit .spec.ts, integração .test.ts),
commits com Model/Agent no corpo (AGENTS.md).

## AUD-15 — nginx 5 req/min por IP em /api/auth/ (DoS de bucket compartilhado)

infra/nginx/nginx.conf:

- `limit_req_zone ... rate=5r/m` → `rate=20r/m`
- `limit_req zone=auth_limit burst=5 nodelay` → `burst=10 nodelay` (2 locations)
- Atualize os comentários AUD-11 explicando: nginx = camada grossa; a fina
  (sliding window 5/min email, 20/min IP) vive na app; 20r/m alinhado a
  MAX_REQUESTS_PER_IP (server/utils/shared/security.ts:28).

## AUD-16 — sem rate limit por usuário em rotas autenticadas

server/utils/shared/security.ts:

- Nova constante `MAX_REQUESTS_PER_USER = 60`
- Exportar `checkUserRateLimit(event: H3Event, userId: string): Promise<void>`
  reusando a função interna `checkRateLimitKey` (linha 99) com chave
  `rate:user:${userId}` (mesmo padrão de checkIpRateLimit/checkEmailRateLimit).

server/middleware/auth.ts:

- Após sessão válida, ANTES do emitSessionEvent (linha 115) e antes de setar
  event.context: `await checkUserRateLimit(event, session.user.id)`
- Requests 429 não emitem session_validated (menos lixo em auth_event)

Testes:

- server/middleware/auth.spec.ts: (1) sessão válida + limite não atingido →
  segue e emite evento; (2) limite atingido → throw 429 e createAuthEvent NÃO
  chamado; (3) rotas públicas continuam sem o check
- server/utils/shared/security.spec.ts: janela/limite do evaluateRateLimit
  com MAX_REQUESTS_PER_USER (unit, sem DB)
- server/utils/shared/security.test.ts: chave `rate:user:` persiste no DB e
  janela desliza (integração, mesmo padrão do teste de checkIpRateLimit)

Verificação: pnpm test, pnpm lint, docker compose config. Commits:

1. fix(infra): nginx rate limit 5→20r/m burst 10 (AUD-15)
2. fix(auth): rate limit por usuário nas rotas autenticadas (AUD-16)
