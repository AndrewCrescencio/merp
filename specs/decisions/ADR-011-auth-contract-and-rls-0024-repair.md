# ADR-011: Contrato da camada de identidade e reparo do RLS 0024

## Contexto

A camada `server/utils/auth/identity/queries.ts` tinha divergido dos seus
consumidores e das specs. Todos os itens abaixo exigiram edição de caminhos
protegidos por `AGENTS.md` (`server/utils/auth/**`, `server/api/auth/**`,
`drizzle/0024_*`), que a constituição só permite alterar via ADR:

1. **Login quebrado.** O commit `10c4634` (rotulado "PATCH orders/status")
   mudou `signInUser` para retornar `{user, session, headers, setCookie}`,
   enquanto `login.post.ts` lia `result.response.user`. Toda autenticação
   bem-sucedida lançava 500. `login.post.spec.ts` tinha 0 testes, então nada
   acusou a quebra.
2. **AUD-07 derrotado.** O gate de conta desativada rodava dentro do `try` de
   `signInUser`, cujo `catch` remapeia todo 401 para `invalid_credentials` —
   apagando `account_deactivated` e fazendo a tentativa contar para o lockout,
   do qual a spec isenta esse caso.
3. **FR-017 / FR-021 não implementados.** `deactivate.post.ts` e
   `consent/withdraw.post.ts` envolviam `updateUser`/`revokeSessions` do Better
   Auth em `catch {}`. Ambos exigem sessão ativa (401 aqui) e o `catch`
   engolia o erro: `isActive` nunca era alterado. Usuário desativado ou que
   retirou o consentimento voltava a logar normalmente.
4. **FR-021 no registro.** `registerUser` gravava o consentimento via
   `auth.api.updateUser` (401 sem sessão): a linha era criada e a requisição
   falhava — conta órfã + erro ao usuário.
5. **AUD-03.** O Better Auth ecoa um perfil que não persiste no caso de
   duplicata, então `registerUser` devolvia um id inexistente que o handler
   registrava em auditoria.
6. **RLS 0024 inválido.** As policies de `location` referenciavam uma coluna
   `location_id` que a tabela não tem (ela é chaveada por `id`), então nenhuma
   delas podia ser aplicada.
7. **Repositório de empresa.** `sendNotFoundError` era chamado sem jamais ser
   importado (`ReferenceError` → 500 no lugar de 404) e conflito de CNPJ
   estourava como 500 em vez de 409.

## Decisão

1. `signInUser` passa a retornar `{response: {user, session, token}, headers,
setCookie}`, que é o formato que `login.post.ts` consome. `session` é
   `SessionResult | null`. Um teste de regressão fixa o formato.
2. O gate AUD-07 roda **antes** do Better Auth e **fora** do `try` de
   `signInUser`, de modo que o `catch` não pode remapear nem contar para o
   lockout.
3. FR-017/FR-021 passam a SQL direto (`deactivateWith`): `user` e `session`
   não têm RLS (tabelas do Better Auth) e não dependem de sessão ativa.
   `deactivateUser` e `withdrawConsent` são a única fonte do fato e são
   chamadas pelos handlers.
4. O carimbo de consentimento é um único `UPDATE` sobre a linha recém-criada.
5. `registerUser` faz pre-check por email e devolve `null` na duplicata.
6. As policies de `location` em `0024` passam a usar `id`.
7. `company/repository.ts` importa `sendNotFoundError` e mapeia `23505` para
   409 via `isPgConflict`/`sendConflictError`, seguindo o padrão já
   estabelecido em `invite/repository.ts`.
8. `RegisterInput.consentTermsVersion` volta a ser **obrigatório**. A
   imposição real acontece em `validateRegisterInput` (FR-021), e o tipo não
   pode ficar opcional sob risco de um chamador pular o validador.

## Ações executadas

1. `server/utils/auth/identity/queries.ts` — contrato de retorno, gate AUD-07,
   `findUserByEmail`, `findSessionByToken`, `listUserAuthEvents`, carimbo de
   consentimento por SQL, pre-check de duplicata, `deactivateWith` /
   `deactivateUser` / `withdrawConsent` (substituindo `deactivateUserBA` /
   `withdrawConsentBA`, que não tinham chamadores).
2. `server/api/auth/deactivate.post.ts` e `consent/withdraw.post.ts` — chamam
   as funções acima; removidos os `catch {}` que mascaravam a falha.
3. `server/api/auth/register.post.ts` — remove o 2º argumento morto de
   `registerUser`.
4. `server/api/auth/reset-password/[token].get.ts` — reusa
   `queries.validateResetToken` em vez de uma cópia literal.
5. `drizzle/0024_rls_location_scoped.sql` — policies de `location` usam `id`.
6. `server/utils/auth/company/repository.ts` — import de `sendNotFoundError` e
   mapeamento de conflito → 409.
7. `server/utils/shared/validate.ts` — `consentTermsVersion` obrigatório.
8. `server/utils/test-setup.ts` + `apply-custom-sql.ts` — setup da base de
   dados por TCP, sem depender de `docker compose exec`.
9. Specs de auth passam a mockar `identity/queries` em vez do módulo
   `identity/repository`, que já não existe; `test-utils.ts` corrigido (a
   sintaxe inválida impedia 3 suítes de carregarem).

## Motivo

- **Uma fonte por fato**: `deactivateUser`/`withdrawConsent` eram código morto
  enquanto os handlers reimplementavam (e erravam) a mesma regra.
- **Falha fechada**: um `catch {}` em operação de desativação converte uma
  falha de permissão em falso sucesso. O erro tem de propagar.
- **Verificação > eco**: o Better Auth não devolve `isActive`, então o valor
  vem da linha lida pelo gate; o `session_id`/`tenant_id` de auditoria vêm de
  um lookup indexado, não de um round-trip que nunca roda.

## Consequências e riscos

- **Lacuna do RLS 0024.** Qualquer ambiente que aplicou a versão antiga falhou
  no meio (a coluna inexistente é erro de SQL, não silêncio), deixando as
  policies de `location` pela metade. Como `0024` usa
  `DROP POLICY IF EXISTS` + `CREATE POLICY`, **reexecutar
  `scripts/apply-custom-sql.ts` repara o ambiente por completo**. O setup de
  testes reexecuta a todo run; em produção o reexecuto é manual e deve ser
  feito no próximo deploy.
- **`registerUser` perdeu o 2º argumento** e `RegisterInput.consentTermsVersion`
  é obrigatório: chamadores internos precisam informar o consentimento.
- **`rethrowCompanyError`** só traduz `23505`; outros erros seguem intactos.

## Critério para reavaliar

1. Se `user`/`session` passarem a ter RLS, o SQL direto de FR-017/FR-021
   precisa migrar para `withTenant`.
2. Se o Better Auth expuser `isActive`/`consentTermsAcceptedAt` como
   `additionalFields` com `input: true`, o carimbo por SQL pode voltar a API.
