---
title: 'Runbook: Deploy seguro (Vercel + Neon + Resend)'
slug: 'deploy-secure'
category: 'guide'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'operations'
tags: ['runbook', 'deploy', 'security', 'vercel', 'neon', 'resend']
audience: ['devops', 'dev']
created: '2026-10-15'
updated: '2026-10-15'
review-cycle: 'quarterly'
related:
  - 'env-variables'
  - 'dev-environment'
  - 'error-codes'
replaces: []
replaced-by: null
---

# Runbook: Deploy seguro (Vercel + Neon + Resend)

## Objetivo

Subir o MERP em produção **sem desligar nenhuma proteção que o código assume**:
RLS com role própria, rate limit por IP real, segredos fortes e emails de
verificação funcionando.

Cada passo termina com uma **verificação**. Se ela falhar, não siga adiante —
os passos seguintes dependem do anterior.

Caminho principal: Vercel Hobby + Neon Free + Resend Free. Caminho Docker no
final.

## Pré-requisitos

- Contas: **Vercel Hobby**, **Neon Free**, **Resend Free**
- Domínio apontado no seu DNS (o Resend exige provar dono)
- Local: Node 24 (`.nvmrc`), npm 11, `openssl`, git
- `npm ci` verde e `npm run check` verde no branch que vai subir

---

## 1. Gere os segredos ANTES de qualquer coisa

```bash
openssl rand -base64 48   # → BETTER_AUTH_SECRET
openssl rand -base64 48   # → CSRF_SECRET
```

> **Por que antes:** o `.env.example` traz `change-me` nos dois, de propósito —
> é curto demais. Copiar o exemplo sem trocar **faz o boot recusar** em produção
> (`validate-env.ts` exige >= 32 chars em `BETTER_AUTH_SECRET`; `csrf.ts` idem
> em `CSRF_SECRET`). É proposital: subir assinando cookies e tokens de
> verificação com um segredo publicado no repositório seria falha de segurança
> silenciosa.

**Verificação:** `printf %s "$BETTER_AUTH_SECRET" | wc -c` → `64` ou mais.

Guarde os dois no gerenciador de segredos, nunca no git. O `.env` está no
`.gitignore` — confirme antes de qualquer commit:

```bash
git status --porcelain | grep -E '(^|/)\.env$' && echo "PARA: .env seria rastreado"
```

---

## 2. Neon: banco + a role do app (aqui se ganha ou se perde o RLS)

### 2.1 Criar o projeto e separar as duas strings

O MERP usa **duas roles distintas** por exigência do RLS:

| Variável           | Role                  | Para quê                         | Nunca             |
| ------------------ | --------------------- | -------------------------------- | ----------------- |
| `DATABASE_URL`     | dona (`neondb_owner`) | **só migração**                  | nunca no app      |
| `APP_DATABASE_URL` | `merp_app`            | o runtime do app (com RLS ativo) | nunca na migração |

1. Crie o projeto no Neon Free e copie a string **pooled** → `DATABASE_URL`.
2. Rode as migrações localmente contra esse banco:

```bash
DATABASE_URL='<string pooled da role dona>' npm run db:migrate:full
```

`db:migrate:full` = `pre-migrate` → `drizzle-kit migrate` →
`apply-custom-sql.ts` (cliente `postgres` do Node — **não precisa de `psql`**).
Ele cria as 23 tabelas, as 17 policies com `FORCE ROW LEVEL SECURITY`, e cria
e concede privilégios à `merp_app` (`drizzle/0014_app_role_ensure.sql` +
grants das `0015`, `0017`, `0020`).

### 2.2 ⚠️ A role `merp_app` nasce SEM senha — você define

A `0014` faz `CREATE ROLE merp_app WITH LOGIN;` **sem `PASSWORD`**: a
credencial é da operação. Sem o passo abaixo, `APP_DATABASE_URL` falha em
autenticar.

No **SQL Editor do Neon** (conectado como a role dona):

```sql
ALTER ROLE merp_app WITH LOGIN PASSWORD '<openssl rand -base64 32>';
```

O Neon exige senha com ~60 bits de entropia (>= 12 caracteres mistos) — a
saída do `openssl rand -base64 32` serve.

### 2.3 ⚠️ NUNCA crie `merp_app` pelo painel do Neon

Roles criadas pelo **Console, CLI ou API** do Neon herdam `neon_superuser`, que
inclui **`BYPASSRLS`**. Com `BYPASSRLS`, todo o RLS do MERP é ignorado — em
silêncio, sem erro algum. O app funcionaria lendo dados de todas as empresas
juntas.

Deixe a migração `0014` criar a role (SQL, sem `BYPASSRLS`). Se você já a
criou pelo painel, corrija:

```sql
REVOKE neon_superuser FROM merp_app;
```

### 2.4 Montar `APP_DATABASE_URL`

Mesma host/porta/db da `DATABASE_URL`, trocando usuário e senha pelos de
`merp_app`. Mantenha `sslmode=require`.

No Vercel, **não configure `DATABASE_URL`**: o runtime não a usa
(`server/utils/db.ts` só a lê em `createOwnerDbForSetupOnly`, de migração e
setup de teste). Não ter credencial de dono no ambiente do app é intencional.

### 2.5 Verificação — RLS realmente vigora

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'merp_app';
-- esperado: f | f
-- qualquer t → NÃO use essa string: o RLS não valeria.
```

```sql
SELECT count(*) FROM pg_policies;
-- esperado: 17
```

---

## 3. Resend: domínio verificado antes da chave

Sem `RESEND_API_KEY` e `RESEND_FROM` **o boot recusa em produção**
(`validate-env.ts`), e sem signup não existe conta.

1. Crie a conta no Resend → **Domains** → adicione o domínio → publique os
   registros DNS (SPF/DKIM/DMARC) que ele exibir.
2. Aguarde o estado **Verified** (DNS pode levar minutos ou horas).
3. **API Keys** → _Create API Key_ → `RESEND_API_KEY`.
4. `RESEND_FROM` = um endereço **dentro do domínio verificado**
   (ex.: `merp@seudominio.com`).

**Verificação:** acontece no passo 5, com um signup real. Antes disso, se
faltar alguma das duas variáveis, o Vercel não sobe e a mensagem aponta
qual delas.

---

## 4. Vercel: variáveis e o `TRUST_PROXY`

### 4.1 Variáveis

Tabela completa em [`env-variables`](../../07-reference/env-variables.md) e no
README (seção _Deploy — caminho grátis_). As que costumam dar problema:

| Variável                       | Valor                 | Por quê                                      |
| ------------------------------ | --------------------- | -------------------------------------------- |
| `APP_DATABASE_URL`             | role `merp_app`       | role errada = RLS não protege                |
| `DATABASE_URL`                 | **não configure**     | credencial de dona, desnecessária no runtime |
| `BETTER_AUTH_SECRET`           | >= 32 chars           | boot recusa se fraco                         |
| `CSRF_SECRET`                  | >= 32 chars           | boot recusa se fraco                         |
| `BETTER_AUTH_URL`              | URL pública do deploy | gera links de verificação e reset            |
| `CORS_ORIGIN`                  | URL pública do deploy | é _baked_ no build **e** lido em runtime     |
| `RESEND_API_KEY`/`RESEND_FROM` | do passo 3            | obrigatórias em produção                     |
| `TRUST_PROXY`                  | `true`                | ver 4.2                                      |
| `TRUSTED_PROXY_CIDRS`          | ver 4.2               | obrigatório quando `true`                    |

### 4.2 `TRUST_PROXY` — não existe "subnet do Vercel" para documentar

> **Em uma frase:** `TRUSTED_PROXY_CIDRS` é a lista das faixas de IP dos
> proxies em que o app confia para ler `X-Forwarded-For` — o header que diz o
> IP real do cliente, e que **qualquer cliente pode forjar**. Por isso só é
> lido quando **quem abriu a conexão TCP direto** com a função está na lista.
>
> **Notação CIDR** (`IP/bits`, quantos bits do endereço são fixos):
> `172.28.0.0/16` = de `172.28.0.0` a `172.28.255.255` · `127.0.0.1/32` = um
> único IP · `::1/128` = o mesmo em IPv6. Aceita **várias** separadas por
> vírgula. Ver
> [env-variables → Segurança](../../07-reference/env-variables.md#segurança).

O `X-Forwarded-For` só é lido quando `TRUST_PROXY=true` **e** o peer TCP
imediato da função está em `TRUSTED_PROXY_CIDRS` (`server/utils/shared/ip.ts`).
Do ponto de vista da função, o peer é o **proxy local da plataforma**, não um
bloco de IP público do Vercel. Por isso não existe valor fixo a documentar: ele
se **descobre**.

**Procedimento (converge em uma iteração):**

1. Configure `TRUST_PROXY=true` e `TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128`.
2. Dê deploy e faça **login uma vez** (ou cadastre uma conta).
3. No SQL Editor do Neon:

```sql
SELECT event_type, ip_address, created_at
FROM auth_event
ORDER BY created_at DESC
LIMIT 5;
```

4. **Decida pelo resultado:**

| `ip_address`                             | Significado                              | Ação                                           |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| IP público, diferente a cada cliente     | proxy confiado ✓                         | pronto                                         |
| Sempre o **mesmo** IP, que não é o seu   | é o endereço do proxy — o CIDR não casou | adicione-o a `TRUSTED_PROXY_CIDRS` e redeploie |
| Vazio, ou igual a `127.0.0.1` para todos | o header não foi lido                    | idem: adicione o IP mostrado e redeploie       |

**Por que isso importa:** sem confiar no proxy, todos os clientes caem no
**mesmo** bucket `rate:ip:<proxy>` — 20 requisições de auth por minuto para o
site inteiro (`MAX_REQUESTS_PER_IP = 20`, `RATE_WINDOW_MS = 60_000`, em
`server/utils/shared/security.ts`). Você mesmo bloquearia os próprios
usuários com `429`.

O risco contrário é confiar demais (uma faixa ampla de IPs): aí um atacante
falsifica `X-Forwarded-For` e contorna o limite. Por isso o desenho é
fail-closed — CIDR errado significa header ignorado, ou seja, degradado mas
nunca explorável. Por isso também só se adiciona o endereço exato observado
no passo 4.

---

## 5. Checklist pós-deploy

Rode tudo uma vez, em produção de verdade.

| #   | Ação                                         | Esperado                                                                |
| --- | -------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `GET /api/health/ready`                      | `200` com `auth`/`db` `ok` (`503` = instância fora do rotation)         |
| 2   | Novo cadastro com email inexistente          | `201` e **email de verificação chega**                                  |
| 3   | Clicar no link do email                      | conta verificada                                                        |
| 4   | Repetir o cadastro com o **mesmo** email     | `201` idêntico, mesmo formato e duração — não revela que a conta existe |
| 5   | 21ª requisição de auth em menos de 60s       | `429` com `Retry-After`                                                 |
| 6   | Conferir `auth_event.ip_address` (passo 4.2) | IP real do cliente, um por cliente                                      |
| 7   | "Esqueci a senha" com email **inexistente**  | resposta igual à de um email existente, sem vazar                       |

Se o boot cair, a mensagem de `validate-env.ts` diz qual variável está
faltando — não tente contornar removendo a checagem.

---

## 6. Caminho alternativo: Docker em produção

O `docker-compose.prod.yml` (nginx + certbot) **não** é o caminho do Vercel e
exige servidor próprio. Se usar:

1. Gere os segredos (passo 1) e monte um `.env` completo a partir do
   `.env.example` — **troque todos os `change-me`**.
2. `RESEND_API_KEY` e `RESEND_FROM` estão como `${VAR:?}` no compose: sem
   elas o `docker compose up` **recusa a subir**.
3. O banco também precisa das duas roles (passo 2). Compose local usa
   `172.28.0.0/16` como `TRUSTED_PROXY_CIDRS` (rede Docker) — não loopback.
4. Suba com
   `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` e
   valide com o mesmo checklist do passo 5.

---

## Se algo falhar

| Sintoma                                                | Causa provável                                      |
| ------------------------------------------------------ | --------------------------------------------------- |
| Boot recusa no Vercel, mensagem apontando uma variável | variável faltando ou fraca (passos 1 e 3)           |
| `permission denied` em `/api/auth/*`                   | `APP_DATABASE_URL` na role errada, ou sem grants    |
| `role merp_app does not exist`                         | migração não rodou (passo 2.1)                      |
| `password authentication failed for user "merp_app"`   | senha não definida (passo 2.2)                      |
| `429` em massa para todos os usuários                  | proxy não confiado pelo `TRUSTED_PROXY_CIDRS` (4.2) |
| Email não chega                                        | domínio não verificado, ou `RESEND_FROM` fora dele  |

## Referências

- `docs/07-reference/env-variables.md` — todas as variáveis
- `server/utils/shared/ip.ts` — regra do `X-Forwarded-For`
- `server/utils/shared/security.ts` — `checkIpRateLimit`, `enforceMinimumTime`
- `server/plugins/validate-env.ts` — fail-closed de produção
- `drizzle/0014_app_role_ensure.sql` — criação da `merp_app`
