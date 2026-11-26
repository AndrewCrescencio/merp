# Decisões técnicas vigentes

## Fundação e isolamento

- **Nuxt 4 + Nitro:** frontend e API no mesmo projeto, com SSR quando útil.
- **Better Auth:** autenticação é infraestrutura compartilhada e não deve ser
  reimplementada por produto.
- **Drizzle + PostgreSQL com RLS:** toda consulta de dados de tenant executa
  dentro de `withTenant`; o banco é a última barreira de isolamento.
- **Tenant no path:** rotas de domínio usam
  `/api/v1/companies/{companyId}/...`; middleware valida a associação antes
  do handler. O tenant nunca é aceito do body.
- **Fail closed:** ausência de sessão, tenant ou configuração obrigatória
  gera erro explícito, sem fallback permissivo.
- Features comerciais pertencem a aplicações derivadas e são módulos
  verticais; o schema da fundação segue pequeno.
- Identidade e integração Better Auth ficam em `server/utils/auth/identity`;
  repositórios de empresas, membros, convites e locais ficam em
  `server/utils/companies/`.
- Contratos compartilhados entre API e frontend ficam em
  `shared/contracts/<dominio>.ts`; a validação no servidor usa a saída
  normalizada do schema.

## API, validação e autorização

- Rotas usam kebab-case e verbos HTTP explícitos. Handlers de produção sob
  `server/api/v1/` usam `defineAuthHandler(async (event, user) => ...)`, salvo
  exceções explícitas como `server/api/auth/logout.post.ts` e endpoints
  públicos de auth/health.
- `requireTenant(event)` resolve o tenant do path. Papéis são verificados com
  `assertRole` e `ROLES`; os únicos papéis são `owner` e `member`.
- Entrada é validada por contratos compartilhados em
  `shared/contracts/<dominio>.ts` ou, durante a migração, por adaptadores em
  `server/utils/shared/validate.ts` (`validateXxxInput`), nunca por schemas
  definidos no handler. Use a saída normalizada da validação.
- Regras de autorização ficam próximas do caso de uso. IDs deriváveis do path
  ou da sessão não devem ser confiados quando enviados no body.
- Cada mudança de schema acompanha migration e testes.

## Migrations

- Crie migrations com `npx drizzle-kit generate --name <descricao>` ou
  `--custom` para SQL manual. Revise o SQL, aplique com
  `npm run db:migrate:full` e execute a suíte de integração.
- **Migrations compartilhadas são imutáveis.** Não edite ou reaplique arquivos
  deletados em bancos já migrados; crie uma migration nova para corrigir ou
  alterar o schema. Bancos compartilhados já aplicaram o journal, por isso
  reescrever o histórico pode causar divergência entre ambientes.
- `npm run check:migrations` (executado no CI) detecta prefixos duplicados.
  Mantenha prefixos e journal coerentes.

## Testes e dados

- Vitest tem quatro projetos: `unit` (`*.spec.ts`, sem banco, mockado e
  paralelo), `integration` (`*.test.ts`, PostgreSQL real e sequencial), `e2e`
  (`tests/e2e/**/*.e2e.ts`, Nitro real por HTTP) e `app` (`app/**/*.spec.ts`,
  ambiente Nuxt). `npm test` executa todos.
- Testes de integração ficam em `tests/`; `globalSetup` aplica
  `db:migrate:full`. Código que abre pool com
  `createOwnerDbForSetupOnly()` deve fechá-lo no `afterAll`.
- Endpoints de domínio precisam de cobertura de comportamento, autorização e
  isolamento entre tenants.
- Acesso a dados usa repositórios concretos singleton, importados diretamente
  pelos handlers. Testes unitários mockam o módulo do repositório; testes de
  integração usam a instância real contra o banco.
- A suíte completa roda no CI com PostgreSQL 18: migrations como owner e
  testes como `merp_app`. Localmente, unitários podem rodar sem PostgreSQL.

## Retenção

O histórico de membership e convites após soft delete de uma empresa ainda
depende de decisão de produto. Não altere essa semântica destrutiva sem uma
decisão explícita.

## Decisões operacionais da fase 9

Avaliação de 26/11/2026 sobre o starter em `dev`, no commit `4b8af75`. A
evidência vem do checkout, do CI e de ensaios com Node 24.22.3 e PostgreSQL
18.6 descartável. O CI confirmou migrations como owner, suíte como
`merp_app` e build. O GitHub não retornou deployments cadastrados. A
topologia, os consumidores externos e a telemetria do ambiente alvo seguem
por confirmar. [Execução do CI](https://github.com/AndrewCrescencio/merp/actions/runs/45759054208)

Mudanças de comportamento dependem de decisão para o ambiente alvo e seguem
em PRs separados.

### Cota da exportação

Manter `GET /api/v1/me/data-export` na cota comum de 120 requisições por
usuário em uma janela deslizante de 60 segundos. O middleware aplica a chave
`rate:api:common:<userId>` antes de chamar o handler. O helper
`checkExportRateLimit` tem teto de 5 e chave `rate:export:<userId>`, mas o
handler atual não o chama. O middleware `pii-audit` registra o acesso
autenticado como `pii_access` com `purpose: data_export`.
[Auth](../server/middleware/auth.ts) · [Limites](../server/utils/shared/security.ts) · [Exportação](../server/api/v1/me/data-export/index.get.ts) · [Auditoria de acesso](../server/middleware/pii-audit.ts)

Uma cota dedicada reduz a frequência máxima de exportações e devolve `429`
mais cedo aos clientes. Custa uma transação extra em `auth_security_state`
por chamada que chega a essa checagem. Os clientes precisam respeitar
`Retry-After`.
Reavaliar quando métricas de frequência, latência ou carga mostrarem que a
exportação excede o orçamento operacional acordado, ou quando produto aprovar
um limite explícito de uso da rota.

Se aprovada, aplicar a chave de exportação uma vez após autenticação e antes
de buscar os dados, mantendo a cota comum e `pii_access`. Em um PR próprio,
verificar por HTTP cinco sucessos, `429` com `Retry-After` no sexto pedido,
cota independente para outro usuário, reabertura da janela e cota comum ainda
aplicável. Confirmar nos logs o registro de acesso para as tentativas
autenticadas que chegam ao middleware de auditoria.

### Frequência de `session_validated`

Manter uma tentativa de gravar `session_validated` por requisição que chega ao
middleware de autenticação, tem sessão válida e passa pela cota comum. O
evento é gravado em segundo plano, em uma transação com três chamadas de
configuração de escopo e um `INSERT`. Falhas de gravação geram aviso. O
consumidor identificado no código é o próprio usuário, que recebe o histórico
em `authEvents` na exportação. `pii_access` é emitido no log por outro
middleware. Amostrar ou agregar eventos mudaria o histórico exportado.
[Auth](../server/middleware/auth.ts) · [Escrita de auditoria](../server/utils/shared/audit.ts) · [Escopo da transação](../server/utils/db/tenant-context.ts) · [Exportação](../server/api/v1/me/data-export/index.get.ts)

No banco descartável, após um evento de aquecimento, `createAuthEvent`
gravou 1.000 eventos de 20 identidades sintéticas como `merp_app`, em
sequência e com `fsync` e `synchronous_commit` ativos. A tabela com seus
índices cresceu 448 KiB (`pg_total_relation_size`) e o avanço do LSN do
cluster correspondeu a cerca de 646 KiB de WAL. O lote levou 611 ms, com
p95 de 1,18 ms por chamada de gravação. A amostra mede o custo marginal nesse
banco. Volume, latência HTTP e custo financeiro de produção precisam de
medições no ambiente alvo.

Para reavaliar, obter com operação a contagem agregada diária de
`session_validated` e de todos os eventos em uma semana representativa,
comparar crescimento da tabela, I/O, uso do pool e p95 da exportação, e
conferir avisos de falha de gravação. Confirmar com o responsável pelos dados
os usos em exportação, investigação e eventuais integrações de auditoria.
Considerar redução quando houver um custo acima do orçamento acordado e o
nível de detalhe aceito estiver definido. Comparar as mesmas métricas e a
completude do histórico exportado em staging antes de adotar.

### Tasks de retenção

Manter quatro tasks. Elas já compartilham `runPurgeTask` e mantêm nomes,
resultados e erros separados. O build registra as quatro em `0 * * * *`
(minuto zero de cada hora no runtime `node-server`). O Nitro dispara as
tasks do horário em paralelo. A deduplicação por nome ocorre em cada
processo. Confirmar em staging quantas instâncias agendam o trabalho, o
fuso do runtime e os consumidores dos logs antes de alterar a execução.
[Agendamento](../nuxt.config.ts) · [Logs e retorno](../server/utils/shared/purge.ts)

| Task                                                                        | Corte configurado                                                 | Permissão e resultado observado como `merp_app`                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`purge-session`](../server/tasks/purge-session.ts)                         | `expires_at` anterior a 24 h atrás                                | `DELETE` direto, tabela sem RLS. Removeu a sessão expirada há 25 h e conservou a de 23 h.                         |
| [`purge-verification`](../server/tasks/purge-verification.ts)               | `expires_at` anterior a 24 h atrás                                | `DELETE` direto, tabela sem RLS. Removeu a verificação expirada há 25 h e conservou a de 23 h.                    |
| [`purge-auth-security-state`](../server/tasks/purge-auth-security-state.ts) | `updated_at` anterior a 7 dias atrás                              | `DELETE` direto, tabela sem RLS. Removeu o estado inativo há 8 dias e conservou o de 6 dias.                      |
| [`purge-auth-event`](../server/tasks/purge-auth-event.ts)                   | `created_at` anterior a 90 dias por padrão, com mínimo de 30 dias | `DELETE` direto filtrado pelo RLS com FORCE. Retornou sucesso com zero exclusões e conservou o evento de 91 dias. |

Os logs observados usam os prefixos `purge_session`, `purge_verification`,
`purge_auth_security_state` e `purge_auth_event`, com sufixos `_start`,
`_complete` e `_error`. Nas quatro tasks compiladas, retirar temporariamente
o grant de `DELETE` no banco descartável produziu `_error` e `result: error`.
Após restaurar o grant e reexecutar cada task, as três primeiras removeram
apenas suas linhas elegíveis. A quarta continuou sem remover eventos. Uma
falha de banco não gera retentativa imediata. Recuperar a dependência e
reexecutar a task pelo runner do ambiente ou conferir seu próximo disparo,
observando tanto `deletedCount` quanto o estoque elegível.

A task de `auth_event` precisa de uma decisão de correção separada antes de
qualquer unificação. No ensaio, `public.purge_auth_events(interval)` chamada
como `merp_app` removeu a amostra de 91 dias com retenção de 90, manteve a de
89 e respeitou o piso de 30 quando recebeu 1 dia. A função executa com a role
dedicada `merp_purge`, sem login nem BYPASSRLS. O journal revoga `EXECUTE` de
`PUBLIC` e autoriza `merp_app`. Ligar a função à task pode remover de uma vez
o volume acumulado de eventos vencidos de um deploy. Reavaliar com o prazo
efetivo aprovado, o volume elegível contado e a capacidade de recuperação
confirmada pela operação. No PR próprio, verificar limite, grants, RLS,
contagem removida, segunda execução e recuperação da task em staging.
[RLS](../drizzle/0002_rls_policies_grants.sql) · [Função de purge](../drizzle/0005_purge_auth_events.sql) · [Proteção do `search_path`](../drizzle/0006_harden_purge_auth_events.sql)

Só reconsiderar a consolidação diante de custo observado de manter quatro
execuções. Uma proposta precisa preservar disparo e recuperação por task,
limites de retenção, privilégios, nomes de log e possibilidade de as outras
tasks terminarem quando uma falha. Medir atraso, linhas elegíveis e tempo de
execução por task antes e depois em staging.

### Journal de migrations

Preservar o journal `0000` a `0007`. As oito entradas passaram pelo CI e foram
aplicadas num PostgreSQL 18.6 vazio no ensaio local, com `db:migrate:full`
como owner, guarda de FORCE verde e acesso como `merp_app` sem BYPASSRLS. Um baseline novo
acrescentaria custo de reconciliar histórico e risco de divergência de
schema, funções ou permissões em bancos já migrados.
[Journal](../drizzle/meta/_journal.json) · [CI](../.github/workflows/ci.yml) · [Guarda de RLS](../scripts/verify-rls.ts)

Reabrir apenas se os responsáveis de todos os ambientes compartilhados
confirmarem no inventário e nos journals dos bancos que nenhum aplicou a
cadeia, e se o provisionamento do candidato passar em banco vazio. Comparar
schema, roles, grants, funções e policies (incluindo ENABLE e FORCE), executar
`db:migrate:full` com owner e repetir a inspeção e a suíte como `merp_app`.

### Tailwind e Vite

Manter o gerador atual até passar uma alternativa de ponta a ponta. Em
checkout limpo o CSS compilado é ignorado pelo Git e `npm run dev` não o
gera. O GET de `/auth/login` devolveu `500` por falta de `tailwind.css`.
Rodar `node scripts/generate-tailwind.mjs` antes de `npm run dev` produziu
`200` e estilos Tailwind. O build vigente passou, com 13.401 bytes no CSS
gerado e 13.275 bytes no CSS de entrada entregue ao cliente. A geração
anterior ao dev precisa ser repetida ao introduzir
utilitários que ainda não estejam no CSS.
[Scripts](../package.json) · [Gerador](../scripts/generate-tailwind.mjs) · [Configuração Nuxt](../nuxt.config.ts)

Em uma cópia isolada, importar `main.css` e configurar
`@tailwindcss/postcss` no Nuxt fez o login responder `200` com estilos sem
geração prévia. O bundle cliente produziu CSS de entrada idêntico byte a
byte. A etapa SSR do build falhou com `ENOENT` ao resolver `tailwindcss`,
mesmo com a dependência disponível na raiz do checkout de ensaio.
Reavaliar quando a equipe definir se precisa apenas iniciar dev a partir de
clone limpo ou também regenerar utilitários durante desenvolvimento. Exigir
dev limpo com estilos, atualização após adicionar uma classe, CSS equivalente
nas páginas existentes e build cliente e SSR verdes em Node 24 e no CI.

### Compose, nginx e certbot

- Manter Compose como opção de desenvolvimento e tratar o overlay de
  produção como candidato até operação confirmar host, banco e forma de
  deploy. O `make prod` ordena a migração antes do start. A configuração
  renderizada com Compose 5.7.1 mostrou que `ports: []` no overlay mantém o
  bind do PostgreSQL em `127.0.0.1:5432`. Também mostrou que o app recebe
  `APP_DATABASE_URL`, enquanto `DATABASE_URL` pertence ao serviço `migrate`,
  e que `AUTH_EVENT_RETENTION_DAYS` não é repassada ao app pelo overlay.
  O Makefile lê `.env.production.example`, embora o README oriente editar
  `.env`. Se a topologia for adotada, validar em staging o arquivo de ambiente
  efetivo, os binds, o prazo de retenção, a separação de credenciais e o
  bloqueio da subida quando a migração falha. O custo da opção inclui manter o
  host e seus volumes. [Compose base](../docker-compose.yml) · [Overlay](../docker-compose.prod.yml) · [Makefile](../Makefile)
- Manter nginx no modelo de proxy da stack até definir onde o TLS termina.
  A configuração aponta para `app:3000`, fixa o hostname e sobrescreve os
  headers de encaminhamento. Trocar a camada de entrada exige reproduzir o
  contrato de origem e IP que a aplicação consome. Com domínio e redes
  definidos, verificar HTTP para HTTPS, hostname, IP observado, health e uma
  mutação autenticada no navegador. A mutação merece um teste real porque o
  servidor fornece CSRF em header com cookie `HttpOnly`, enquanto o
  composable vigente lê `document.cookie`.
  [Proxy](../infra/nginx/nginx.conf) · [CSRF no servidor](../server/middleware/01-csrf-token.ts) · [Composables](../app/composables/useApiFetch.ts)
- Manter certbot como candidato para TLS no host. O overlay compartilha
  volumes de certificados e webroot entre nginx e certbot. A emissão usa
  `DOMAIN`, o nginx espera a linhagem `live/merp`, e o cron de renovação com
  reload aparece como instrução, sem evidência de execução. Se a operação
  escolher certbot, confirmar domínio, DNS, porta do desafio ACME, linhagem,
  responsável pela renovação e custo de manter o agendamento. Ensaiar emissão
  inicial em host vazio, renovação com `--dry-run`, reload e certificado
  efetivamente servido. Se a plataforma cuidar do TLS, comprovar essas
  garantias na camada gerenciada. [Configuração do certbot](../docker-compose.prod.yml) · [Paths do nginx](../infra/nginx/nginx.conf)

### Gatilhos para propostas futuras

| Proposta                    | Quando reavaliar e de quem depende                                                                                                | Custo e critério para verificar                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Paginação e filtros         | Primeira listagem de negócio. Produto define ordenação, filtros e volumes do derivado.                                            | Contrato de navegação e índices. Verificar páginas estáveis com os filtros previstos e isolamento entre empresas.          |
| Permissões por ação         | Primeiro caso em que `owner` e `member` não expressam a regra. Produto define a matriz de permissões.                             | Mais regras para manter. Exercitar cada ação permitida e negada por HTTP e banco.                                          |
| Idempotência                | Primeiro comando sujeito a repetição. Cliente e produto definem chave, escopo e janela.                                           | Persistir a chave e o resultado. Verificar repetições concorrentes, conflito de payload e rollback.                        |
| Outbox ou fila              | Primeira entrega assíncrona que exija garantia. O consumidor define tolerância a atraso e duplicatas.                             | Worker, retentativas e operação da fila. Verificar recuperação após falha e deduplicação ponta a ponta.                    |
| Funções no lugar de classes | Uma mudança concreta simplifica os chamadores. Manutenção compara o diff da operação.                                             | Atualizar imports e mocks. Verificar que as assinaturas e garantias de transação e RLS continuam válidas.                  |
| Observabilidade             | Uma questão operacional tem impacto e os sinais atuais não a respondem. Operação define indicador e orçamento.                    | Instrumentação e manutenção dos dados. Verificar que o sinal explica o problema e permite diagnosticar uma falha induzida. |
| Better Auth Organization    | Uma necessidade concreta de associação no derivado justifica avaliar a integração. Produto e identidade definem a regra faltante. | Compatibilidade e migração de associações. Verificar convites, remoções, papéis e RLS na mesma matriz de isolamento.       |
