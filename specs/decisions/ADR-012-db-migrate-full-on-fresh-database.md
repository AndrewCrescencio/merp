# ADR-012: `db:migrate:full` em banco novo — migração órfã e `.env` não carregado

## Contexto

`pnpm db:migrate:full` é o caminho documentado no README para inicializar um
banco novo. **Nunca funcionou.** Duas causas independentes:

1. **`0013_round_half_up.sql` está fora do journal.** O journal tem 15 entries
   e o slot `0013` ficou com `0013_noisy_mimic`; o arquivo que cria a função
   `round_half_up(numeric)` existe em `drizzle/` mas nunca é registrado. Como
   `drizzle-kit migrate` só aplica o que está no journal, a função não é criada.
2. **`0014_add_order_tables.sql` já depende dela** — as policies de
   `order_items` usam `round_half_up(numeric)`. Como o drizzle-kit executa as
   migrações numa transação, o `CREATE POLICY` falha com `42883`, o rollback
   desfaz tudo (0 tabelas, 0 linhas em `__drizzle_migrations`) e **o erro não
   chega à saída**: o usuário vê só NOTICEs de `DROP POLICY IF EXISTS` e
   `exit 1`, sem mensagem alguna.
3. **O `.env` nunca foi carregado.** `drizzle-kit` tem loader próprio de `.env`,
   mas os passos `tsx` (`scripts/apply-custom-sql.ts` e o novo pre-step) usam
   `process.env` direto. `cp .env.example .env && pnpm db:migrate:full`, o fluxo
   que o README manda, morria em `DATABASE_URL não definida`.

O banco de testes nunca acusou isso porque `server/utils/test-setup.ts` cria
`round_half_up` explicitamente antes do `drizzle-kit push` — o problema estava
contornado, não resolvido.

## Decisão

1. Passo prévio `scripts/pre-migrate.ts` que aplica `0013_round_half_up.sql`
   **antes** do `drizzle-kit migrate`. Lê o próprio `.sql`, sem duplicar a
   definição da função.
2. Os passos `tsx` de `db:migrate:full` passam a receber `--env-file-if-exists=.env`
   (nativo no Node ≥ 20.12). Com `.env` ausente — CI exporta `DATABASE_URL` —
   o comportamento é inalterado.
3. O CI passa a rodar `pnpm db:migrate:full` no lugar de
   `drizzle-kit migrate` + `apply-custom-sql.ts` separados: os dois jobs tinham
   o mesmo defeito num service container fresco.

## Por que NÃO editar `0014_add_order_tables.sql`

A correção óbvia seria embutir o `CREATE OR REPLACE FUNCTION` no topo da própria
migração 14. **Não é seguro:** o drizzle-kit guarda o _hash_ de cada migração
aplicada em `__drizzle_migrations`. Alterar o arquivo muda o hash e faz o
`migrate` rejeitar todo banco que já o aplicou — ou seja, quebraria os ambientes
existentes para consertar os novos. O passo prévio não toca em nada já gravado.

## Ações executadas

1. `scripts/pre-migrate.ts` — novo, idempotente, lê `drizzle/0013_round_half_up.sql`.
2. `package.json` — `db:migrate:full` ganha o passo prévio e `--env-file-if-exists`.
3. `.github/workflows/ci.yml` — os dois passos de migração viram `pnpm db:migrate:full`.

## Verificação

Num banco recém-criado (sem nada):

| Etapa                 | Antes         | Depois          |
| --------------------- | ------------- | --------------- |
| `drizzle-kit migrate` | falha, exit 1 | 15/15 migrações |
| Tabelas em `public`   | 0 (rollback)  | 23              |
| Tabelas com RLS       | 0             | 16              |
| Policies              | 0             | 65              |
| `round_half_up`       | inexistente   | ok              |

## Consequências

- `make init` passou a rodar de ponta a ponta.
- **Risco conhecido:** `0013_round_half_up.sql` continua fora do journal. Se
  algum dia for removida, o pre-step quebra de forma explícita e com mensagem
  clara — o que é melhor do que o rollback silencioso de antes.
- As NOTICEs que o drizzle-kit imprime (`DROP POLICY ... skipping`) continuam
  na saída. São inofensivas e vêm do próprio drizzle-kit.

## Critério para reavaliar

Se a função `round_half_up` for criada por uma migração **no journal** (ex.:
gerando uma nova com `drizzle-kit generate`), o passo prévio e o arquivo órfão
podem ser removidos.
