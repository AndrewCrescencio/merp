# Fase 3A — Matriz de contratos HTTP

Inventário das 19 rotas `/api/v1` no checkout legado (`defineAuthHandler(async
(event, user) => ...)`). Sessão e CSRF passam pelo Nitro real; fixtures e limpeza
usam somente `merp` (owner). As respostas e leituras de estado são feitas via
HTTP com `merp_app`.

| Rota                                                           | Sessão / tenant / papel                                                             | Limite                      | Body / query                        | Validação e auditoria                                              | Resposta                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------- | ----------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `GET /me`                                                      | Sessão; sem tenant                                                                  | 120/min usuário             | —                                   | Sem validação de entrada; sem evento                               | `200` perfil e companies                                        |
| `GET /companies`                                               | Sessão; lista só memberships próprias                                               | 120/min usuário             | Query `q`                           | Obrigatório, não vazio, até 100 chars; sem evento                  | `200 { companies }`; vazio ou ausente `400`                     |
| `POST /companies`                                              | Sessão; cria owner                                                                  | 120/min usuário + 20/min IP | `{ name }`                          | Não vazio, até 200 chars; sem evento de auditoria                  | `201`, `Location: /api/v1/companies/:id`                        |
| `GET /companies/:companyId`                                    | Sessão; tenant requerido; membro                                                    | 120/min usuário             | —                                   | Sem validação de entrada; sem evento                               | `200` company e locations; não membro `404`                     |
| `PATCH /companies/:companyId`                                  | Sessão; tenant requerido; owner                                                     | 120/min usuário             | `{ name? }`                         | Body validado antes de `assertRole`; audita `company_updated`      | `200` company; vazio/member inválido `400`                      |
| `DELETE /companies/:companyId`                                 | Sessão; tenant requerido; owner                                                     | 120/min usuário             | —                                   | Audita `company_deleted`                                           | `204`, corpo vazio                                              |
| `GET /companies/:companyId/locations`                          | Sessão; tenant requerido; membro                                                    | 120/min usuário             | —                                   | Sem validação de entrada; sem evento                               | `200 { locations }`                                             |
| `POST /companies/:companyId/locations`                         | Sessão; tenant requerido; owner                                                     | 120/min usuário             | `{ name }`                          | Papel antes do body; nome não vazio até 200 chars                  | `201`, `Location: /api/v1/companies/:companyId/locations/:id`   |
| `PATCH /companies/:companyId/locations/:locationId`            | Sessão; tenant requerido; owner                                                     | 120/min usuário             | `{ name? , isActive? }`             | Papel antes do body; pelo menos um campo; nome/boolean validados   | `200`; inexistente `404`; member `403`                          |
| `DELETE /companies/:companyId/locations/:locationId`           | Sessão; tenant requerido; owner                                                     | 120/min usuário             | —                                   | Sem body                                                           | `204`, vazio; inexistente `404`                                 |
| `GET /companies/:companyId/members`                            | Sessão; tenant requerido; owner                                                     | 120/min usuário             | —                                   | Sem validação de entrada; sem evento                               | `200 { members }`; member `403`                                 |
| `DELETE /companies/:companyId/members/:userId`                 | Sessão; tenant requerido; owner remove outro; member pode sair; owner não pode sair | 120/min usuário             | —                                   | Sem body; audita `member_removed`                                  | `204`, vazio; owner alvo `403`; alvo ausente `404`              |
| `PATCH /companies/:companyId/members/:userId/default-location` | Sessão; tenant requerido; owner                                                     | 120/min usuário             | `defaultLocationId`: string ou null | Body antes do papel; audita `member_default_location_updated`      | `200`; member com body vazio `400`                              |
| `GET /companies/:companyId/invitations`                        | Sessão; tenant requerido; qualquer membro                                           | 120/min usuário             | —                                   | Sem validação de entrada; sem evento                               | `200 { invites }`                                               |
| `POST /companies/:companyId/invitations`                       | Sessão; tenant requerido; owner                                                     | 120/min usuário + 20/min IP | `{ email }`                         | Email normalizado/validado antes do papel; audita `invite_created` | `201`, `Location: /api/v1/companies/:companyId/invitations/:id` |
| `POST /me/invitations/accept`                                  | Sessão; email deve corresponder ao convite                                          | 120/min usuário + 20/min IP | `{ token }`                         | Token obrigatório; audita `invite_accepted`                        | `200` id, companyId e acceptedAt                                |
| `POST /me/deactivate`                                          | Sessão; sem tenant                                                                  | 120/min usuário             | —                                   | Audita `session_invalidated` e `deactivation`                      | `200` mensagem                                                  |
| `GET /me/data-export`                                          | Sessão; sem tenant                                                                  | 120/min usuário             | —                                   | Sem validação de entrada; inclui eventos de auditoria              | `200` export de perfil, companies, sessões e eventos            |
| `POST /me/consents/withdraw`                                   | Sessão; sem tenant                                                                  | 120/min usuário             | `{}` (body ignorado)                | Audita `consent_withdrawal`                                        | `200` mensagem                                                  |

## Evidência E2E desta fase

`tests/e2e/companies-locations.e2e.ts` roda em servidor Nitro real via HTTP,
Better Auth real e PostgreSQL. Há cobertura de fluxo de sessão, `401` com
empresa válida, `403` em operações owner-only, `404` cross-tenant, escrita com
CSRF e rejeição sem CSRF com leitura posterior, convites listados por member,
criados por owner e aceitos pelo destinatário, saída voluntária, proteção do
owner na remoção, criação `201` com Location, remoção `204` sem corpo e leitura
via HTTP após recusas para confirmar que o estado não mudou.

## Precedência do checkout legado

`PATCH company`, `POST invitations` e `PATCH default-location` validam o body
antes de negar papel; um body inválido responde `400` para member hoje. O
wrapper que verifica papel antes do callback/body mudaria para `403`. Os PATCH
de locations verificam papel antes de ler/validar body e respondem `403` para
member mesmo com body inválido. Os testes de contrato mantêm a precedência
vigente nesta fase; qualquer migração deve tratar essa mudança explicitamente.

Todas as rotas `/api/v1` autenticadas passam pelo middleware comum de 120
requests/minuto por usuário. As três rotas que chamam `checkIpRateLimit`
também têm 20 requests/minuto por IP. Ao atingir o limite, respondem `429`
com `Retry-After`, `RateLimit-Reset` e `RateLimit-Remaining: 0`.

Todas as rotas desta matriz exigem sessão (`401 unauthorized` sem sessão). As
rotas sob `/companies/:companyId` resolvem tenant pelo path; empresa ausente
ou usuário que não pertence a ela recebe `404 not_found`. Operação de papel
restrito negada recebe `403 forbidden`. Toda escrita exige o cookie CSRF e
header `x-csrf-token` correspondente; ausência ou divergência retorna `403
csrf_invalid`. Requests seguros para `/api/` emitem o token no header
`x-csrf-token` e no cookie CSRF. Criações usam `201` e o `Location` especificado
na tabela; remoções sem representação usam `204` com corpo vazio.
