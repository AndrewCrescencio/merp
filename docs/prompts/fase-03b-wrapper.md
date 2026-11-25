# Fase 3B — Wrapper e migração dos handlers

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Localize os E2E de empresas, locais, convites e membros e execute-os antes de alterar o helper. Reconstitua a matriz a partir dos handlers e dessas asserções se o resumo do PR anterior estiver indisponível. Complete primeiro qualquer cobertura que falte para o grupo a migrar.

## Tarefa

Evolua `defineAuthHandler` em `server/utils/shared/handler.ts` com cobertura HTTP dos contratos vigentes. Os 19 handlers /v1 já chamam o helper. Conserve o nome, a assinatura legada durante a transição e check:routes. Adicione um overload (options, handler) cujo contexto infira user, tenant e body. Use uma união discriminada para rotas com tenant e rotas de sessão como /me e a coleção /companies. A opção role exige tenant e “any” exige associação à empresa resolvida. Aceite um validador legado síncrono ou assíncrono e um schema Zod com tipo de saída inferido.

O middleware já autentica, encaminha `Set-Cookie`, aplica a cota comum e resolve a associação quando o path traz companyId. Dentro do wrapper, valide a sessão do contexto, aplique o limite específico já contratado, leia o tenant resolvido, verifique o papel, leia e valide o body uma vez, execute o handler e então a auditoria informativa e a resposta de criação, quando configuradas. A precedência papel antes de body é a mudança pública deliberada. Use as opções rateLimit, tenant, role, body, audit e created. Permita evento simples ou função de resultado e contexto para compor metadados. Preserve mensagens específicas, headers e metadados. Mantenha regras condicionais de negócio no handler ou no repositório.

Migre primeiro POST de invitations. Ele já usa limite por IP, owner, `invite_created` com companyId e invitedEmail e `201 + Location`. Migre depois companies, locations, as demais rotas de convites e membros e /me, conferindo a matriz de contratos HTTP por grupo. Preserve leituras sem tenant, 204 sem corpo, os dois eventos de desativação e a saída voluntária do próprio member. Em locations, mantenha a política de auditoria e o limite existentes. Preserve a leitura de parâmetros dinâmicos além de companyId com `getRouterParam` no handler, como exige o verificador. Preserve as entradas existentes de `auth/*`, inclusive logout, e de `health/*`.

Audite sucesso apenas depois de ele ocorrer. `createAuthEvent` já registra falha de gravação em log e protege a resposta. Uma auditoria obrigatória de negócio exige a transação da operação ou entrega durável específica. Teste 401, 403, 404, entrada inválida, 429, rota sem tenant, erro do handler sem evento de sucesso, falha de auditoria após commit e `201 + Location`. Inclua verificação de tipos para body transformado e combinação de opções inválida. Considere a migração concluída quando as 19 rotas usarem a nova assinatura e o README tiver um exemplo real. Verifique cada grupo com a matriz de contratos HTTP.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
