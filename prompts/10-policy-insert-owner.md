# 10 — Policy de INSERT em `company_member` com verificação de owner (P2 crítica)

> **ESTADO (2026-08-01):** a função `is_company_owner(cid)` **já existe** no banco
> (criada pela migration `0006_invites_rls.sql` — mesma definição abaixo, não
> precisa recriar; `CREATE OR REPLACE` no prompt original é inofensivo se rodar).
> As policies `cm_insert_policy`/`cm_update_policy` **ainda são as originais**
> (`WITH CHECK (true)` e sem WITH CHECK) — este prompt é o que falta.
> Numeração da migration nova: **`0008`**.
>
> **AMENDMENT (2026-08-01, após revisão pós-0007):** este prompt foi ampliado com
> dois pontos que o 0007 (`FORCE ROW LEVEL SECURITY`) tornou obrigatórios:
>
> 1. **Policy INSERT em `company`** — sem ela, `createCompany` (`repository.ts`,
>    `db.insert(company)` sem `withTenant`) é **negado** com FORCE RLS para qualquer
>    role (inclusive owner e `merp_app`). Criação de empresa ficaria quebrada.
> 2. **`cm_update_policy` restrito a owner** — o `OR role = 'member'` originalmente
>    proposto permitiria ao member mover a própria row para outro `company_id`
>    (WITH CHECK passa, USING passou na row antiga) — entrada em empresa sem convite.

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

### 2. Policy INSERT em `company` (pré-requisito do FORCE RLS — 0007)

Sem policy de INSERT, `company` com `FORCE ROW LEVEL SECURITY` nega `createCompany`
para **qualquer** role (owner inclusive — RLS passa a valer para o owner; e a role
de app `merp_app` também não tem grants de DBA). O fluxo `companies.post.ts`
(autenticado) → `createCompany` → `createCompanyMember(..., 'owner')` precisa dela:

```sql
CREATE POLICY company_insert_policy ON company FOR INSERT
  WITH CHECK (true);
```

**Por que `WITH CHECK (true)` é aceitável aqui (não alterar sem motivo):**

- **Criação de empresa é um fluxo aberto a qualquer usuário autenticado** — o
  endpoint `companies.post.ts` já exige sessão (401 sem usuário); a RLS não
  consegue verificar "autenticação" sem contexto (`get_user_id()` é NULL fora de
  `withTenant`, e o `createCompany` atual não roda em `withTenant`).
- **A fronteira de tenant não depende do INSERT em `company`** — o controle vem do
  bootstrap em `company_member` (policy da seção 3: self + tenant ou owner) e das
  policies de SELECT/UPDATE/DELETE em `company` (escopadas a `get_tenant_id()`).
  Empresa recém-criada sem membro é inacessível por não-owner.
- **Alternativa rejeitada:** exigir `get_user_id() IS NOT NULL` (e wrappear
  `createCompany` em `withTenant(null, userId)`) — adiciona reescrita de repositório
  sem ganho de segurança real, já que qualquer autenticado pode criar empresa.

### 3. Substituir a policy de INSERT em `company_member`

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

### 4. Fechar auto-promoção via UPDATE

`cm_update_policy` hoje é `USING (company_id = get_tenant_id())` sem `WITH CHECK` —
um member poderia trocar a própria role para `owner`. Substituir por:

```sql
DROP POLICY cm_update_policy ON company_member;

CREATE POLICY cm_update_policy ON company_member FOR UPDATE
  USING (company_id = get_tenant_id())
  WITH CHECK (is_company_owner(company_id));
```

**Por que sem `OR role = 'member'` (amendment):** com o `OR role = 'member'`, um
member poderia mover a própria row para **outro** `company_id` mantendo
`role = 'member'` — o `USING` valida a row antiga (do tenant atual) e o `WITH CHECK`
passaria pelo `role = 'member'` — entrada em empresa sem convite (reabre versão
fraca do self-join que o app removeu). Hoje **nenhum fluxo legítimo** atualiza a
própria row (`acceptInvite` é INSERT; `setActiveCompany` mexe em `session`) — a
única escrita em `company_member` hoje é o INSERT da seção 3. UPDATE é exclusivo do
owner: gestão de roles/remoção de membro (prompt 11 — guard `assertCompanyRole`).

## Fluxos atuais (validar com testes)

| Fluxo                                                     | Comportamento com a nova policy  |
| --------------------------------------------------------- | -------------------------------- |
| Criar empresa (`createCompany` — INSERT em `company`)     | ✅ `company_insert_policy`       |
| Bootstrap: criador vira owner da própria empresa          | ✅ auto-inserção (self + tenant) |
| Aceitar convite (`invites.accept.post.ts`, role `member`) | ✅ auto-inserção (self + tenant) |
| Owner adiciona membro/owner                               | ✅ `is_company_owner`            |
| Usuário externo insere em empresa alheia                  | ❌ RLS bloqueia                  |
| Member troca a própria role para `owner` via UPDATE       | ❌ `WITH CHECK` bloqueia         |
| Member move a própria row para outro tenant via UPDATE    | ❌ `WITH CHECK` bloqueia         |
| Owner altera roles/remove membro via UPDATE               | ✅ `is_company_owner`            |

## Testes

No fim de `server/utils/auth/repository.test.ts` (ou novo arquivo `.test.ts`):

1. Criar empresa A com owner A → sucesso (`createCompany` com FORCE RLS ativo).
2. Criar empresa B com owner B.
3. Owner A adiciona membro em A → sucesso.
4. Usuário B tenta inserir-se como owner em A via SQL direto (sem app-layer) →
   RLS bloqueia (erro `42501`/`P0001` ou 0 rows).
5. Join: usuário X (não membro) entra em A como `member` → sucesso (fluxo aberto).
6. UPDATE: member tenta trocar role para `owner` → bloqueado pelo RLS.
7. UPDATE: member tenta mover a própria row para empresa B → bloqueado pelo RLS.

## Verificação

```bash
npx drizzle-kit migrate
npx vitest run server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).
