# Fase 4 — Estratégia de testes por responsabilidade

Trabalhe no checkout de AndrewCrescencio/merp, na branch recebida. Leia `CLAUDE.md` e os scripts de `package.json`. Selecione um grupo de rotas que já use o wrapper declarativo e disponha de cobertura HTTP em tests/e2e/. Mapeie as garantias atuais antes de retirar qualquer spec.

## Tarefa

Revise os testes do MERP por grupo já migrado. Use .spec.ts para lógica pura e unidades isoladas, .test.ts para repositórios, RLS, atomicidade e persistência em PostgreSQL, e .e2e.ts para o contrato HTTP real. Reserve o projeto app para a experiência Vue. Mantenha os testes específicos do wrapper sobre ordem, audit, tipos e propagação de erros.

Para cada spec de handler candidato a remoção, aponte a asserção pública equivalente em outro teste. Uma função mockada ter sido chamada não demonstra que o acesso foi autorizado. Preserve estados, respostas, headers ou efeitos exclusivos antes de remover o spec. Examine company/repository e shared/security, que hoje misturam .spec e .test. Separe a lógica pura da integração quando isso corresponda a responsabilidades reais. Confira os padrões de descoberta do Vitest.

Inclua em `CLAUDE.md` um modelo curto para agentes escolherem os casos de sessão, papel, isolamento e caminho feliz aplicáveis à operação. Referencie o README para a receita de feature. Aceite quando os quatro projetos executarem, unit passar sem banco e as verificações de autorização/RLS usarem `merp_app`. Relate quais garantias substituíram cada grupo de mocks removido.

## Entrega

Use Node 24. Execute `npm run check`, `npm test` e `npm run build`. Para integração e E2E, use um banco de testes com `DB_AVAILABLE=true`, migrations como proprietário e aplicação como `merp_app`. No resumo da entrega, registre o SHA, as mudanças, os testes efetivamente executados e qualquer verificação pendente.
