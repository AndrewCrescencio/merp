# Prompt 35 — AUD-24 + documentação completa da auditoria

## AUD-24 — BETTER_AUTH_SECRET não exigida no boot

server/plugins/validate-env.ts: em produção, exigir BETTER_AUTH_SECRET com
length ≥ 32 (senão throw com a mensagem no padrão das demais). Teste no
validate-env.spec.ts (missing/encurtada em produção; ausente fora de prod = ok).

## Documentação — docs/security/security-audit-2026-08-18.md (novo)

Relatório completo da auditoria de 2026-08-18, no formato de
docs/security/auth-audit-2026-08.md (Categoria / Severidade / Localização /
Descrição / Impacto / Status / Correção aplicada / Testes):

- AUD-15 nginx bucket compartilhado — resolvido (prompt 33)
- AUD-16 rate limit por usuário — resolvido (prompt 33)
- AUD-17 GET PII sem no-store — resolvido (prompt 34)
- AUD-18 reset token em claro em verification — pendente (design better-auth;
  mitigação: dump do banco já expõe o resto; registrar como risco aceito)
- AUD-19 role merp_app/grants core fora de migração + DATABASE_URL owner no
  container — pendente (operacional; migração de grants recomendada)
- AUD-20 company_select_policy aberta / findCompanyById sem membership —
  pendente (oráculo de existência por ID; endpoints atuais não vazam dados)
- AUD-21 tetos empresa — resolvido (prompt 34)
- AUD-22 email regex — resolvido (prompt 34)
- AUD-23 body types lax — resolvido (prompt 34)
- AUD-24 validate-env secret — resolvido (prompt 35)
- AUD-25 /api/health sem rate limit — aceito (registrar decisão)
- Observações: cm_insert_policy owner→owner (design 0008); session.token em
  claro (design better-auth); sendOnSignIn reenvia verificação (limitado a
  5/min por email)

## docs/pendencies.md

Inserir AUD-18, AUD-19, AUD-20 como pendências no padrão do arquivo,
apontando para o relatório. Remover/atualizar qualquer item que estas
correções resolvam.

Verificação: pnpm test, pnpm lint. Commits:

1. fix(auth): exigir BETTER_AUTH_SECRET no boot de produção (AUD-24)
2. docs(security): relatório da auditoria 2026-08-18 + pendências (AUD-15..25)
