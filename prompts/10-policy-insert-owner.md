# 10 — Policy de INSERT em `company_member` com verificação de owner (P2 crítica)

> **ESTADO (2026-08-01):** a função `is_company_owner(cid)` **já existe** no banco
> (criada pela migration `0006_invites_rls.sql` — mesma definição abaixo, não
> precisa recriar; `CREATE OR REPLACE` no prompt original é inofensivo se rodar).
> As policies `cm_insert_policy`/`cm_update_policy` **ainda são as originais**
> (`WITH CHECK (true)` e sem WITH CHECK) — este prompt é o que falta.
> Numeração da migration nova: **`0008`**.

## Contexto

`drizzle/0005_misty_silver_sable.sql` L31-32 define:

```sql
CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (true);
```

Qualquer um pode inserir `company_member` de **qualquer empresa** com qualquer role.
O app-layer não valida o role do caller em lugar nenhum — quando o endpoint de
adicionar membro existir, isso vira escalada de privilégio (auto-promoção a owner).

## Alterações

### 1. Função SQL `is_company_owner`

Nova migration (`npx drizzle-kit generate --custom`):

```sql
CREATE OR REPLACE FUNCTION is_company_owner(cid text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_member
    WHERE company_id = cid AND user_id = get_user_id() AND role = 'owner'
  );
$$ LANGUAGE SQL STABLE;
```

### 2. Substituir a policy de INSERT

Mesma migration:

```sql
DROP POLICY cm_insert_policy ON company_member;

CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (
    -- owner adiciona qualquer membro (qualquer role)
    is_company_owner(company_id)
    -- auto-inserção com contexto válido: bootstrap (criador vira owner da própria
    -- empresa) e aceite de convite (self join como member via invite)
    OR (user_id = get_user_id() AND company_id = get_tenant_id())
  );
```

**Por que o design é assim (não alterar sem motivo):**

- **Bootstrap:** `companies.post.ts` chama `createCompanyMember(created.id, user.id, 'owner')`
  com `withTenant(companyId, userId)` — o criador ainda não é membro, então
  `is_company_owner` é falso. A auto-inserção (self + tenant) é o único caminho que
  preserva o fluxo. Restringir por `role = 'member'` **quebraria a criação de empresa**.
- **Semântica de roles é camada de app (prompt 11):** RLS garante _fronteira de
  tenant_ (não escrever em empresa alheia); a policy exige que `company_id`
  corresponda ao tenant ativo da sessão OU que o inseridor seja owner. O role em si
  (`owner`/`member`) é controlado pelos endpoints (aceite de convite hardcoda
  `member`; bootstrap é da própria empresa recém-criada) — o guard `assertCompanyRole`
  do prompt 11 impede endpoints futuros de passar role arbitrário.
- **Cross-tenant insert continua bloqueado:** para inserir em empresa alheia o
  atacante precisaria que o app setasse `app.tenant_id` para aquela empresa — só
  acontece via `withTenant` controlado pelo servidor.

### 3. Fechar auto-promoção via UPDATE

`cm_update_policy` hoje é `USING (company_id = get_tenant_id())` sem `WITH CHECK` —
um member poderia trocar a própria role para `owner`. Substituir por:

```sql
DROP POLICY cm_update_policy ON company_member;

CREATE POLICY cm_update_policy ON company_member FOR UPDATE
  USING (company_id = get_tenant_id())
  WITH CHECK (is_company_owner(company_id) OR role = 'member');
```

## Fluxos atuais (validar com testes)

| Fluxo                                                     | Comportamento com a nova policy  |
| --------------------------------------------------------- | -------------------------------- |
| Criar empresa (bootstrap, role `owner`)                   | ✅ auto-inserção (self + tenant) |
| Aceitar convite (`invites.accept.post.ts`, role `member`) | ✅ auto-inserção (self + tenant) |
| Owner adiciona membro/owner                               | ✅ `is_company_owner`            |
| Usuário externo insere em empresa alheia                  | ❌ RLS bloqueia                  |
| Member troca a própria role para `owner` via UPDATE       | ❌ `WITH CHECK` bloqueia         |

## Testes

No fim de `server/utils/auth/repository.test.ts` (ou novo arquivo `.test.ts`):

1. Criar empresa A com owner A; empresa B com owner B.
2. Owner A adiciona membro em A → sucesso.
3. Usuário B tenta inserir-se como owner em A via SQL direto (sem app-layer) →
   RLS bloqueia (erro `42501`/`P0001` ou 0 rows).
4. Join: usuário X (não membro) entra em A como `member` → sucesso (fluxo aberto).
5. UPDATE: member tenta trocar role para `owner` → bloqueado pelo RLS.

## Verificação

```bash
npx drizzle-kit migrate
npx vitest run server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
