# Fase 8 — Produtos como primeira feature no projeto derivado

No checkout da aplicação derivada que receberá o catálogo, leia as instruções de contribuição e os scripts de verificação. Identifique as regras locais de empresa, papel e SKU. Para escritas que precisam ser atômicas entre repositórios, use o suporte de transação compartilhada do projeto.

## Tarefa

Implemente o módulo de produtos na aplicação derivada do MERP indicada para esta fase. O starter reserva produtos a derivados. Se o checkout disponível for o starter, valide o percurso completo de locais e registre qual repositório derivado falta indicar.

Adote como escopo inicial proposto um catálogo por empresa, com nome e SKU obrigatórios, descrição opcional e SKU único por empresa. Permita que membros consultem e owners criem, editem e desativem produtos. Respeite regras já aprovadas no produto derivado. Comece no contrato Zod e no schema Drizzle. Crie migration nova, constraint única composta, grants e policies com ENABLE e FORCE RLS. Verifique explicitamente que a nova tabela aparece na inspeção de RLS. Use o repositório concreto em `server/utils/products` e derive companyId da rota e userId da sessão.

Implemente lista e detalhe, criação com `201 + Location`, edição e desativação com 204 em `/api/v1/companies/[companyId]/products`. Deixe explícitos normalização de SKU, ordenação e limite da lista. Entregue useProductsApi e a página Nuxt com estados de carregamento, vazio e erro, além das ações permitidas a cada papel. Confira pelo banco a unicidade inclusive sob escritas concorrentes.

Aceite com migration aplicada num banco de teste, API exercitada como `merp_app` e uma pessoa capaz de cadastrar, encontrar e desativar um produto pela interface. Cubra 401, 403, 404 entre empresas, SKU repetido na mesma empresa com 409, mesmo SKU em empresas distintas e fluxo feliz em HTTP e no projeto app.

## Entrega

No projeto derivado, execute os comandos locais de check, testes e build em Node 24. Se o destino ainda precisar ser indicado, registre o que foi possível verificar no starter.
