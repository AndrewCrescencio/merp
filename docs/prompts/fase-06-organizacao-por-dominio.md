# Fase 6 — Organização dos repositórios por domínio

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Delimite um grupo de arquivos cujas mudanças de wrapper e transações já tenham sido integradas. Faça a movimentação sobre os caminhos vigentes na branch e confira os consumidores antes do primeiro rename.

## Tarefa

Reorganize o domínio que já existe no MERP em uma mudança mecânica. Comece por empresas, membros, convites e locais hoje em `server/utils/auth/company` e `server/utils/auth/invite`. Coloque os arquivos ligados a empresas sob `server/utils/companies`, de acordo com os consumidores. Mantenha identidade e a integração Better Auth em auth. Preserve classes e singletons concretos, schema, assinaturas, SQL e comportamento HTTP ao mover arquivos.

Atualize imports de runtime e type-only, mocks de módulos, aliases, testes e referências em README, `CLAUDE.md` e `docs/decisions.md`. Verifique se os imports internos apontam para módulos de origem e se o Nuxt resolve corretamente os auto-imports. Crie novos diretórios quando houver código que pertença a eles. Aceite com rg sem referências obsoletas, typecheck, check:routes, testes e build passando. Entregue o mapa de caminhos antigos para novos no PR.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
