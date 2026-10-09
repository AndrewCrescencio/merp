# Parte 1: Infra/Config/Dependências — Relatório de Revisão

## Escopo

- `package.json`, `pnpm-lock.yaml`
- `nuxt.config.ts`, `tsconfig.json`, `vitest.config.ts`
- `.env.example`, `drizzle.config.ts`
- `scripts/apply-custom-sql.ts`
- `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.override.yml`
- `server/plugins/validate-env.ts`, `server/plugins/validate-env.spec.ts`

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                  |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Bugs/Falhas** | ⚠️     | 16 vulnerabilidades em deps (2 critical, 9 high, 5 moderate) via cadeias transitiveis; vitest globalSetup roda Docker (falha se indisponível); `apply-custom-sql.ts` parser custom pode falhar em SQL complexo |
| **R2 — Segurança**   | ✅     | Boas práticas: fail-closed em build/runtime, separação de roles DB, subnet pinada, validação de env obrigatórias, sem `env_file` no prod, resource limits, logging rotation                                    |

---

## Achados

### P01-A01 — Vulnerabilidades em dependências transitivas

- **Tipo**: Segurança
- **Severidade**: **Alta** (9 high, 2 critical)
- **Confiança**: Alta
- **Arquivo**: `package.json` / `pnpm-lock.yaml`
- **Evidência**: `pnpm audit` reporta 16 vulns via `@nuxt/devtools>simple-git` (2 critical: GHSA-v5rq-49vh-5v5c, GHSA-x6jw-m9v5-85vh), `markdownlint-cli>glob` (high: GHSA-5j98-mcp5-4vw2), `markdownlint-cli>markdown-it` (moderate), `markdownlint-cli>smol-toml` (moderate)
- **Impacto**: Ataque via CLI `glob` (command injection) ou ReDoS em markdown parsing; `simple-git` unsafe operation guard bypass. Todas em **devDependencies** (ferramentas de build/lint/docs), não em runtime de produção.
- **Correção**: `pnpm up --latest` nas deps afetadas ou `pnpm audit --fix`; priorizar `simple-git>=4.0.1`, `glob>=12.0.0`, `markdown-it>=14.3.1`, `smol-toml>=1.9.0`. Verificar se `@nuxt/devtools` atualizado resolve transitivas.

### P01-A02 — Parser SQL custom em `apply-custom-sql.ts` não cobre todos casos

- **Tipo**: Bug
- **Severidade**: Média
- **Confiança**: Média
- **Arquivo**: `scripts/apply-custom-sql.ts:5-87`
- **Evidência**: Função `splitStatements` implementa parser manual de SQL (quotes, dollar quotes, line/block comments). Não trata: CTEs com `;`, `DO $$ BEGIN ... END $$;`, `CREATE FUNCTION` com body contendo `;`, `COPY ... FROM stdin` com dados contendo `;`.
- **Impacto**: Migrações custom (0014+) podem falhar silenciosamente ou aplicar parcialmente se SQL contiver estruturas não previstas.
- **Correção**: Usar `pg-query-parser` ou `drizzle-kit` com `casual` flag, ou validar que migrações atuais não usam padrões problemáticos (verificarei na Parte 2).

### P01-A03 — Vitest globalSetup falha se Docker indisponível

- **Tipo**: Bug (DX/CI)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `vitest.config.ts:19`, `server/utils/test-setup.ts:43-46`
- **Evidência**: `globalSetup: ['./server/utils/test-setup.ts']` roda `docker compose up -d postgres`. Se Docker indisponível, seta `DB_AVAILABLE=false` mas testes falham depois ao conectar no DB.
- **Impacto**: CI/CD sem Docker (ex.: GitHub Actions sem service container) falha. Desenvolvedores sem Docker não rodam testes.
- **Correção**: Tornar Docker opcional com fallback para DB em memória (ex.: `pglite`/`postgres-wasm`) ou documentar requirement explícito no CI.

### P01-A04 — `tsconfig.json` usa referências `.nuxt/` (gerado no build)

- **Tipo**: Bug (DX)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `tsconfig.json:4-17`
- **Evidência**: `references` apontam para `.nuxt/tsconfig.*.json` que só existem após `nuxt prepare`/`build`. `npx tsc --noEmit` passa mas IDE pode mostrar erros antes do build.
- **Impacto**: Type-check pré-build (ex.: `pre-commit`) pode falhar ou dar falsos positivos.
- **Correção**: Adicionar `tsconfig.build.json` separado para CI, ou usar `nuxt typecheck` (se disponível) em vez de `tsc` direto.

### P01-A05 — CSP (Content Security Policy) não configurado

- **Tipo**: Segurança (endurecimento)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `nuxt.config.ts`
- **Evidência**: `routeRules` define CORS mas não há `Content-Security-Policy` header. Frontend usa Vue 3 + Nuxt 4 — CSP recomendado para mitigar XSS.
- **Impacto**: Se houver XSS em frontend, attacker pode injetar scripts. Mitigação parcial: `httpOnly` cookies, `sameSite: lax`.
- **Correção**: Adicionar `nitro: { routeRules: { '/': { headers: { 'Content-Security-Policy': \"default-src 'self'; script-src 'self' 'unsafe-inline' ...\" } } } }` ou módulo `@nuxtjs/csp`.

### P01-A06 — `nitropack` fixado em `2.13.4` (devDependency)

- **Tipo**: Bug (versionamento)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `package.json:57`
- **Evidência**: `"nitropack": "2.13.4"` (exato, sem `^`). Nuxt 4.6.0 pode depender de versão diferente — conflito potencial.
- **Impacto**: Build pode falhar se Nuxt atualizar dependência interna do Nitro.
- **Correção**: Remover `nitropack` de `devDependencies` (Nuxt já o inclui) ou usar `^2.13.4`.

### P01-A07 — Falta validação de `CSRF_SECRET` length em `validate-env.ts`

- **Tipo**: Segurança
- **Severidade**: Baixa
- **Confiança**: Média
- **Arquivo**: `server/plugins/validate-env.ts` (não li, inferido do spec)
- **Evidência**: `.env.example:33` diz `>= 32 chars`, `docker-compose.prod.yml:26` exige a var, mas `validate-env.spec.ts` não testa `CSRF_SECRET` length (testa só `BETTER_AUTH_SECRET`).
- **Impacto**: CSRF secret fraco facilita CSRF se attacker controlar subdomain.
- **Correção**: Adicionar check `CSRF_SECRET.length >= 32` em `missingProductionEnv` + teste.

---

## Pontos Fortes

- **Fail-closed consistente**: Build falha sem `CORS_ORIGIN` (nuxt.config.ts), runtime falha sem envs obrigatórias (validate-env.ts + docker-compose.prod.yml `${VAR:?}`)
- **Separação de roles DB**: `DATABASE_URL` (owner) só em host/CI; `APP_DATABASE_URL` (merp_app, RLS) no container — AUD-19 respeitado
- **Subnet pinada**: `merp_network: 172.28.0.0/16` + `TRUSTED_PROXY_CIDRS` fixo — previne IP spoofing via X-Forwarded-For
- **Resource limits + logging rotation**: Prod compose tem `deploy.resources.limits.memory: 512M`, `logging.driver: json-file` com `max-size: 10m`
- **Documentação de envs**: `.env.example` com comentários de segurança (AUD-XX) e distinção dev/prod

---

## Sinais para Roadmap

- Vulnerabilidades em devDependencies → atualizar antes de próximo release
- Parser SQL custom → validar migrações existentes (Parte 2) ou migrar para tool padrão
- Testes sem Docker → avaliar `pglite` para CI leve
- CSP → implementar quando frontend expandir além de auth pages

---

## Não Verificado / Dúvidas

- `server/plugins/validate-env.ts` não lido (só spec) — assumo implementação condizente com testes
- `drizzle.config.ts` usa `DATABASE_URL` owner — confirmar que `db:migrate:full` roda fora do container (sim, script usa host env)
- `pnpm-lock.yaml` não auditado completamente — `pnpm audit` cobriu
