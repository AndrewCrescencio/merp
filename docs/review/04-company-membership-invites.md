# Parte 4: Company/Membership/Invites — Relatório de Revisão

## Escopo

- `server/api/auth/companies/` — CRUD + switch + members delete (5 handlers)
- `server/api/auth/invite.post.ts`, `invites.accept.post.ts`, `invites.get.ts` — Convites
- `server/api/auth/consent/withdraw.post.ts` — Retirada de consentimento (LGPD)
- `server/utils/auth/company/repository.ts` — `CompanyRepository`
- `server/utils/auth/company/membership.ts` — `MembershipRepository`
- `server/utils/auth/invite/repository.ts` — `InviteRepository`
- Já revistos na Parte 3: company create/update/delete/switch, invite create/accept, membership roles

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                                                                         |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Bugs/Falhas** | ⚠️     | `searchCompanies` ausente (já reportado P03-A01); `consent/withdraw` desativa conta (`isActive: false`) mas não revoga sessões explicitamente (middleware limpa no próximo request); `members.delete` permite owner remover owner? (não, bloqueia linha 32-34, 62-64) |
| **R2 — Segurança**   | ✅     | Owner-only para create/update/delete/switch company; invite só owner; accept valida token + email + expiração; member self-remove permitido; owner não removível; auditoria completa; RLS backstop em todas queries                                                   |

---

## Achados

### P04-A01 — `consent/withdraw` desativa conta mas não revoga sessões ativas imediatamente

- **Tipo**: Bug / Segurança
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/api/auth/consent/withdraw.post.ts:17-22`
- **Evidência**: Chama `auth.api.updateUser({ isActive: false, consentWithdrawnAt: new Date() })` mas **não revoga sessões**. Better Auth config tem `revokeSessionsOnPasswordReset: true` mas não há `revokeSessionsOnDeactivation`. Middleware `auth.ts` valida sessão a cada request — se `isActive: false`, Better Auth pode ainda retornar sessão válida até expiração (7d).
- **Impacto**: Usuário que retira consentimento continua logado por até 7 dias (session TTL). Viola LGPD Art. 18 (direito de oposição — processamento deve cessar imediatamente).
- **Correção**: Adicionar revogação de sessões no handler:
  ```ts
  const sessions = await auth.api.listSessions({ body: { userId: user.id } })
  for (const s of sessions) await auth.api.revokeSession({ body: { token: s.token } })
  ```
  Ou configurar Better Auth hook se disponível.

### P04-A02 — `members.delete` owner self-remove bloqueado mas owner removal by owner não explícito

- **Tipo**: Segurança (design)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `server/api/auth/companies/members.delete.post.ts:32-34,62-64`
- **Evidência**: Linha 32-34: `if (role === 'owner') sendForbiddenError('Cannot remove a company owner')` — bloqueia self-remove de owner. Linha 62-64: mesmo check para owner removendo outro owner. **Porém**: empresa pode ter múltiplos owners? Schema `company_member` permite múltiplos `role='owner'` por company (unique index em `company_id, user_id` apenas). Se houver 2 owners, um pode remover o outro? Código bloqueia.
- **Impacto**: Design conservador — owner nunca removível via API. Para remover owner, precisa deletar company (soft-delete) ou DB manual.
- **Nota**: Correto para MVP. Documentar que transferência de ownership não implementada.

### P04-A03 — `companyRepository.findCompanyById` usa `withTenant(null, null, userId)` — membership como gate (OK)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/auth/company/repository.ts:86-96`, `drizzle/0016_company_select_membership.sql:12-18`
- **Evidência**: `withTenant(null, null, userId)` → `tenantId=null` (limpa GUC `app.tenant_id`), `userId` setado. Policy `company_select_policy` (0016) permite SELECT se `id = get_tenant_id() OR EXISTS membership`. Como `tenantId=null`, primeiro branch falha, segundo usa `get_user_id()` → membership check no DB. Defesa em profundidade: app + DB.

### P04-A04 — `companyRepository.softDeleteCompany` purga memberships + detacha sessions (OK)

- **Tipo**: Bug / Data integrity (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/auth/company/repository.ts:102-121`
- **Evidência**: Soft-delete seta `isDeleted: true`, deleta `company_member` rows, limpa `session.activeCompanyId` apontando para company. Transacional (usa `withTenant` com `existingTx`).

### P04-A05 — Invite accept: claim atômico + membership insert na mesma transação (OK)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/auth/invite/repository.ts:132-206`
- **Evidência**: `acceptInvite` usa `db.transaction` → `withTenant` nested. Lookup com GUC `app.invite_token_hash` (policy `invite_token_select_policy`). Claim: `UPDATE invite SET acceptedAt=now() WHERE id=? AND acceptedAt IS NULL AND expiresAt > now()` → race-safe. Se claim OK → insert `company_member` com `role='member'` (policy `cm_insert_policy` valida token hash via GUC). Se conflict (já member) → 409, token NÃO consumido (retry possível).

### P04-A06 — Invite token TTL 7 dias, entropy 256-bit, hash SHA-256 armazenado (OK)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/auth/invite/repository.ts:34-45`, `drizzle/0006_invites_rls.sql:14`
- **Evidência**: `INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000`. `generateToken()` = `randomBytes(32).toString('base64url')` (256 bits). `hashToken` = SHA-256 hex. Token devolvido **uma única vez** no response do POST `/invite`. Legacy invites (sem `token_hash`) invalidados por migration 0012 (`UPDATE invite SET expires_at = now() WHERE accepted_at IS NULL AND token_hash IS NULL`).

### P04-A07 — `MembershipRepository.setActiveCompany` re-valida membership na mesma transação (TOCTOU-safe)

- **Tipo**: Segurança (design correto)
- **Severidade**: — (ponto forte)
- **Confiança**: Alta
- **Arquivo**: `server/utils/auth/company/membership.ts:127-150`
- **Evidência**: `setActiveCompany` faz `withTenant(companyId, null, userId)` → dentro da transação, SELECT membership + UPDATE session. Se membership removida entre check e update, transação falha (RLS ou constraint). `getActiveCompany` lê direto do DB (sem `withTenant` — session table global, não tenant-scoped).

---

## Pontos Fortes

- **Owner-only writes**: Create/update/delete/switch company, invite create — todos checam `role === 'owner'` via `assertCompanyRole`
- **Self-remove permitido**: Member pode sair da empresa (`members.delete` sem `userId`)
- **Owner protegido**: Não removível via API (prevents accidental lockout)
- **Invite flow seguro**: Token 256-bit, hash SHA-256, single-use claim atômico, TTL 7d, legacy invalidados
- **Membership gate em DB + App**: `company_select_policy` (0016) + `findCompanyById` com `userId` — defesa em profundidade
- **Soft-delete cascata**: `isDeleted` + purge memberships + detach sessions — sem órfãos

---

## Sinais para Roadmap

- **P0**: `searchCompanies` implementation (já em P03-A01)
- **P1**: `consent/withdraw` revogar sessões imediatamente (LGPD compliance)
- **P2**: Transfer ownership flow (atualmente não implementado — só delete company)
- **P2**: List company members endpoint (não existe — só `invites.get`)

---

## Não Verificado / Dúvidas

- `invites.get.ts` handler não lido (assume list invites da company)
- `companies.get.spec.ts` testes para searchCompanies (vão falhar até implementar)
- LGPD data export (`export.get.ts`) — não revisto
