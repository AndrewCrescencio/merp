# ADR-012: Advisories de cadeia sem correção upstream — aceite risco de dev

## Contexto

O Dependabot reporta 3 advisories no branch padrão (2 high, 1 moderate;
`npm audit` conta 13 porque inclui cada pacote da cadeia). Investigado em
2026-10-17. Estado real, por advisory:

| Advisory                                                                                        | Severidade | Range afetado | Instalado | Última publicada |
| ----------------------------------------------------------------------------------------------- | ---------- | ------------- | --------- | ---------------- |
| `braces` — DoS por esgotamento de pilha em padrões aninhados (GHSA-vfj7-8cjw-p6xm)              | high       | `<=3.0.3`     | `3.0.3`   | `3.0.3`          |
| `node-forge` — verificação RSA PKCS#1 v1.5 aceita `DigestAlgorithm` extra (GHSA-86w9-cpqp-85rv) | high       | `<=1.4.0`     | `1.4.0`   | `1.4.0`          |
| `esbuild` — servidor de dev aceita pedidos cross-origin (GHSA-67mh-4wv8-2f99)                   | moderate   | `<=0.24.2`    | `0.18.20` | `0.28.2`         |

As três são **transitivas** — nenhuma é dependência direta do projeto, e
nenhum ficheiro de `server/`, `app/` ou `shared/` as importa.

## Por que não foi corrigido

- **`braces` e `node-forge` não têm correção publicada.** As versões instaladas
  são as mais recentes do npm; a fix upstream ainda não existe.
- **`esbuild` tem fix (`0.25.0+`), mas a única rota que o audit oferece é
  `npm audit fix --force`, que instalaria `drizzle-kit@0.18.1`** — contra
  `0.31.11`, uma ruptura da ferramenta de migração, caminho crítico. O override
  de `esbuild` para `0.25+` no subtree do `drizzle-kit` não foi feito pelo mesmo
  motivo: o `@esbuild-kit` usa a API do esbuild para transpilar configs, e uma
  quebra só apareceria quando alguém correr uma migração.

## Alcançabilidade verificada

O `esbuild` vulnerável vive no subtree do `drizzle-kit` (devDep), e o advisory
refere-se ao modo `serve()` do esbuild, que o drizzle-kit não usa — transpila
configs localmente.

Para `node-forge`/`braces`, verificado contra o artefato real, não por suposição:

- `.output/server/index.mjs` importa apenas builtins do Node, `better-auth`,
  `@better-auth/drizzle-adapter`, `drizzle-orm/*` e `postgres`.
- Nenhum chunk em `.output/server/chunks` referencia `listhen` ou `node-forge`.
- `.output/server/node_modules/{node-forge,braces}/` existem: são **bagagem**
  copiada pelo traçador de dependências do Nitro, não código alcançável.

Nenhuma superfície HTTP as alcança.

## Decisão

Aceitar o risco. **Não correr `npm audit fix --force`.**

## Consequências

- Reavaliar quando o npm publicar `braces@3.0.4+` ou `node-forge@1.4.1+`:
  basta `npm audit fix`, sem ruptura.
- Ao mexer em `drizzle-kit`, conferir se o seu `esbuild` subiu para `0.25+`.
- Se algum dia `listhen` passar a ser importado por código de runtime, o
  `node-forge` deixa de ser bagagem e esta decisão tem de ser revista.
