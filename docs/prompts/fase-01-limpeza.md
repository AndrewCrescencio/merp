# Fase 1 — Remoção de código sem consumidores

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Confirme que a suíte unitária passa sem PostgreSQL e que a exportação já usa as consultas de identidade e associação. Essas garantias devem sobreviver à limpeza.

## Tarefa

Faça a limpeza do MERP após o baseline verde. Use Knip como inventário e confirme cada candidato com rg, barrel exports, auto-imports Nuxt, convenções Nitro, uso dinâmico, testes e build. No PR, identifique para cada remoção o último uso encontrado e qual caminho continua coberto.

Inspecione checkLoginRateLimit, checkPasswordResetRateLimit, checkHeavyOperationRateLimit, checkUserRateLimit, as constantes exclusivas deles, MAX_COMPANY_NAME_LENGTH, MAX_REQUESTS_PER_REGISTER_IP, validateResetToken, createCompany, findCompanyById e findLocationById. Avalie `shared/sanitize.ts`, seu spec e isomorphic-dompurify juntos. Verifique ws em separado nos dois drivers. O teste condicional de `db.factory.spec.ts` verifica a presença de @neondatabase/serverless, uma dependência direta. Substitua o ramo que passa sem executar por asserções úteis dos drivers suportados.

Mantenha `listUserAuthEvents` em uso pela exportação, resolveLocationId e requireLocationId como infraestrutura de escrita por local, e `checkExportRateLimit` enquanto a política de limite dedicado de exportação estiver em avaliação. Antes de retirar um helper usado em testes, preserve a garantia de autorização, RLS ou limite num caminho de produção equivalente. Atualize os lockfiles afetados. Em commit separado, corrija os comentários de auth.ts sobre login/forgot, a menção a assertCompanyRole em location-repository.ts, o teto antigo em handler.ts e as referências a itens de revisão em logout.post.ts, db.ts e `docs/decisions.md`. Entregue o inventário, as razões das retenções e check, suíte e build verdes em Node 24.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
