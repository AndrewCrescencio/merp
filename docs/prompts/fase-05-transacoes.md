# Fase 5 — Composição de transações e escopo RLS

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Leia a implementação de `withTenant` e seus chamadores reais. Comece com os testes atuais de tenant-context, de aceite de convite e de criação de empresa executando com `merp_app`.

## Tarefa

Melhore `server/utils/db/tenant-context.ts` e os repositórios concretos do MERP para compor uma operação de negócio em uma única transação. `withTenant` já aceita `existingTx`, e os testes atuais documentam que os parâmetros de sessão do PostgreSQL podem persistir até o commit externo. Mapeie os usos de `existingTx` e os três campos de escopo. Migre para um contexto nomeado `{ companyId, locationId, userId }`, mantendo explícitos os casos pré-empresa e a limpeza por null.

Faça o caso de uso possuir a transação e passar a mesma tx já contextualizada às operações internas. Um repositório chamado dentro dela deve respeitar o escopo recebido. Preserve a conveniência do CRUD simples. Trate como transições explícitas os fluxos que legitimamente descobrem a empresa durante a operação, em particular `acceptInvite` e `findCompanyWithLocations`. Preserve a duração necessária dos marcadores de convite e de bootstrap. Para chamadas aninhadas comuns, garanta que o escopo do chamador continue válido após o retorno. Mantenha explícita qualquer transição cuja duração deva alcançar a próxima etapa. Trate falhas sem reutilizar uma transação abortada. Verifique o comportamento do código nos dois drivers.

Demonstre composição entre operações concretas com um fluxo existente, por exemplo a criação de empresa, local Principal e associação do fundador. Com PostgreSQL e `merp_app`, comprove commit conjunto, rollback integral ao falhar a última escrita, escopo do chamador após uma chamada interna, comportamento com null e isolamento entre transações concorrentes no pool. Preserve o aceite único do convite e o rollback quando a associação falha. Aceite com integração, E2E, check e build verdes. Descreva a semântica de escopo e a garantia transacional no PR.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
