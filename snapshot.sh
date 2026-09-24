#!/usr/bin/env bash
# snapshot.sh v2 — versão defensiva, menos dependente de bashisms
# Uso: bash snapshot.sh

ROOT="$(pwd)"
STAMP="$(date +%Y%m%d-%H%M)"
OUT_DIR="$ROOT/_snapshot"
OUT="$OUT_DIR/snapshot-$STAMP.md"

if [ ! -f "package.json" ]; then
  echo "ERRO: rode na raiz do projeto (sem package.json em $ROOT)"
  exit 1
fi

mkdir -p "$OUT_DIR" || { echo "ERRO: não consegui criar $OUT_DIR"; exit 1; }
: > "$OUT" || { echo "ERRO: não consegui escrever em $OUT"; exit 1; }

echo "Gerando snapshot em $OUT"
echo ""

# ---------- helpers ----------------------------------------------------

# Emite um arquivo com cerca de código; pula binários e arquivos enormes
emit() {
  f="$1"
  [ -f "$f" ] || return 0
  # Pula arquivos > 200 KB (evita lixo tipo lock files gigantes)
  size=$(wc -c < "$f" 2>/dev/null || echo 0)
  if [ "$size" -gt 200000 ]; then
    printf "\n## FILE: %s\n\n_(arquivo > 200 KB, omitido)_\n" "$f" >> "$OUT"
    return 0
  fi
  {
    printf "\n## FILE: %s\n\n" "$f"
    printf '````\n'   # 4 backticks para não colidir com código que tenha ```
    case "$f" in
      *.env|*.env.*|.env|.env.*|*/.env|*/.env.*)
        sed -E 's/^([A-Za-z_][A-Za-z0-9_]*(SECRET|PASSWORD|PASSWD|TOKEN|KEY|PASS|PRIVATE|CREDENTIAL)[A-Za-z0-9_]*=).*/\1<REDACTED>/Ig; s#(postgres(ql)?://[^:]+:)[^@]+@#\1<REDACTED>@#Ig' "$f"
        ;;
      *)
        cat "$f"
        ;;
    esac
    printf '\n````\n'
  } >> "$OUT"
}

section() {
  {
    printf "\n\n# ============================================================\n"
    printf "# %s\n" "$1"
    printf "# ============================================================\n\n"
  } >> "$OUT"
}

# Encontra arquivos evitando diretórios de ruído (grep -v, sem prune complexo)
all_files() {
  find . -type f 2>/dev/null \
    | grep -v '/node_modules/' \
    | grep -v '/\.git/' \
    | grep -v '/\.nuxt/' \
    | grep -v '/\.output/' \
    | grep -v '/dist/' \
    | grep -v '/coverage/' \
    | grep -v '/\.next/' \
    | grep -v '/\.cache/' \
    | grep -v '/\.turbo/' \
    | grep -v '/_snapshot/' \
    | sed 's|^\./||' \
    | sort
}

# ---------- 00 — cabeçalho / ambiente / árvore -------------------------

echo "→ ambiente e árvore"
{
  printf "# SNAPSHOT DO PROJETO — %s\n\n" "$STAMP"
  printf "Gerado em: %s\n" "$(date)"
  printf "Host: %s\n" "$(hostname 2>/dev/null || echo '?')"
  printf "Diretório: %s\n" "$ROOT"
} >> "$OUT"

section "AMBIENTE"
{
  printf '```\n'
  printf "OS:        %s\n" "$(lsb_release -ds 2>/dev/null || uname -s 2>/dev/null || echo '?')"
  printf "Kernel:    %s\n" "$(uname -r 2>/dev/null || echo '?')"
  printf "Node:      %s\n" "$(node -v 2>/dev/null || echo 'n/a')"
  printf "npm:       %s\n" "$(npm -v 2>/dev/null || echo 'n/a')"
  printf "pnpm:      %s\n" "$(pnpm -v 2>/dev/null || echo 'n/a')"
  printf "yarn:      %s\n" "$(yarn -v 2>/dev/null || echo 'n/a')"
  printf "git:       %s\n" "$(git --version 2>/dev/null || echo 'n/a')"
  printf "psql:      %s\n" "$(psql --version 2>/dev/null || echo 'n/a')"
  printf "docker:    %s\n" "$(docker --version 2>/dev/null || echo 'n/a')"
  printf "\n"
  printf "Branch:    %s\n" "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'n/a')"
  printf "Commit:    %s\n" "$(git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
  printf '```\n'
} >> "$OUT"

section "ÁRVORE DE DIRETÓRIOS"
{
  printf '```\n'
  find . -type d 2>/dev/null \
    | grep -v '/node_modules' \
    | grep -v '/\.git' \
    | grep -v '/\.nuxt' \
    | grep -v '/\.output' \
    | grep -v '/dist' \
    | grep -v '/coverage' \
    | grep -v '/_snapshot' \
    | sed 's|^\./||' \
    | grep -v '^\.$' \
    | sort
  printf '```\n'
} >> "$OUT"

section "CONTAGEM POR TIPO"
{
  printf '```\n'
  for ext in ts tsx vue sql md json yml yaml js mjs cjs; do
    n=$(all_files | grep -c "\.$ext\$" 2>/dev/null || echo 0)
    printf "%-6s %5s\n" ".$ext" "$n"
  done
  printf '```\n'
} >> "$OUT"

section "GIT STATUS"
{
  printf '```\n'
  git status --short 2>/dev/null | head -80 || echo "(sem git)"
  printf '```\n'
} >> "$OUT"

# ---------- 01 — configs ----------------------------------------------

echo "→ configs e raiz"
section "CONFIGS E ARQUIVOS DE RAIZ"
for f in \
  package.json pnpm-workspace.yaml \
  tsconfig.json tsconfig.app.json tsconfig.server.json tsconfig.node.json \
  nuxt.config.ts nuxt.config.js \
  drizzle.config.ts drizzle.config.js \
  vitest.config.ts vitest.config.js \
  .env.example .env.sample env.example \
  docker-compose.yml docker-compose.yaml \
  docker-compose.prod.yml docker-compose.prod.yaml \
  Dockerfile Dockerfile.prod \
  eslint.config.js eslint.config.mjs .eslintrc .eslintrc.json .eslintrc.cjs \
  .nvmrc .node-version .prettierrc .prettierrc.json \
  AGENTS.md CLAUDE.md PENDING_DECISIONS.md \
  README.md CONTRIBUTING.md CHANGELOG.md; do
  emit "$f"
done

# ---------- 02 — specs ------------------------------------------------

echo "→ specs"
section "SPECS E DECISÕES"
found=0
for d in specs docs/adr docs/decisions adr decisions; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    emit "$f"
    found=$((found+1))
  done < <(find "$d" -type f -name '*.md' 2>/dev/null | sort)
done
[ "$found" -eq 0 ] && printf "\n_(nenhuma spec encontrada)_\n" >> "$OUT"

# ---------- 03 — schema drizzle ---------------------------------------

echo "→ schema"
section "SCHEMA DRIZZLE"
found=0
for d in server/utils/schema server/db/schema shared/schema src/db/schema db/schema; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    emit "$f"
    found=$((found+1))
  done < <(find "$d" -type f -name '*.ts' 2>/dev/null | sort)
done
[ "$found" -eq 0 ] && printf "\n_(nenhum schema encontrado)_\n" >> "$OUT"

# ---------- 04 — migrations -------------------------------------------

echo "→ migrations"
section "MIGRATIONS SQL"
found=0
for d in drizzle migrations src/db/migrations db/migrations prisma/migrations; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    emit "$f"
    found=$((found+1))
  done < <(find "$d" -type f -name '*.sql' 2>/dev/null | sort)
done
[ "$found" -eq 0 ] && printf "\n_(nenhuma migration encontrada)_\n" >> "$OUT"

# ---------- 05 — auth/db/tenant ---------------------------------------

echo "→ auth/db/tenant"
section "NÚCLEO DE AUTH, DB, TENANT, SEGURANÇA"
for f in \
  server/utils/db.ts server/utils/database.ts \
  server/utils/auth/tenant-context.ts server/utils/tenant-context.ts \
  server/utils/auth.ts shared/auth.ts shared/auth/index.ts \
  server/middleware/auth.ts server/middleware/tenant.ts \
  server/plugins/validate-env.ts \
  server/utils/apply-custom-sql.ts server/utils/apply-custom-sql.test.ts; do
  emit "$f"
done

# Varredura por nome (evita re-emitir os acima via lista prévia)
while IFS= read -r f; do
  case "$f" in
    server/utils/db.ts|server/utils/database.ts) continue ;;
    server/utils/auth/tenant-context.ts|server/utils/tenant-context.ts) continue ;;
    server/utils/auth.ts|shared/auth.ts|shared/auth/index.ts) continue ;;
    server/middleware/auth.ts|server/middleware/tenant.ts) continue ;;
    server/plugins/validate-env.ts) continue ;;
    server/utils/apply-custom-sql.ts|server/utils/apply-custom-sql.test.ts) continue ;;
  esac
  case "$f" in
    *tenant*|*auth*|*rls*|*security*|*session*|*permission*|*role*|*guard*|*policy*)
      emit "$f"
      ;;
  esac
done < <(find server shared src -type f -name '*.ts' 2>/dev/null | grep -v node_modules | sort | head -200)

# ---------- 06 — rotas ------------------------------------------------

echo "→ rotas"
section "ENDPOINTS E ROTAS"
{
  printf "\n### Lista de arquivos de rota\n\n```\n"
  find server/api server/routes src/server/api src/routes 2>/dev/null \
    -type f -name '*.ts' | sort || echo "(n/a)"
  printf "```\n"
} >> "$OUT"

n=0
while IFS= read -r f; do
  n=$((n+1))
  [ "$n" -gt 150 ] && { printf "\n_(+ arquivos de rota omitidos)_\n" >> "$OUT"; break; }
  emit "$f"
done < <(find server/api server/routes src/server/api src/routes 2>/dev/null -type f -name '*.ts' | sort)

# ---------- 07 — testes -----------------------------------------------

echo "→ testes"
section "TESTES"
{
  printf "\n### Lista completa\n\n```\n"
  all_files | grep -E '\.(test|spec)\.(ts|js)$'
  printf "```\n"
} >> "$OUT"

{
  printf "\n### Testes de segurança/RLS (conteúdo)\n"
} >> "$OUT"
while IFS= read -r f; do
  case "$f" in
    *canary*|*concurrent*|*parity*|*tenant*|*rls*|*security*|*isolation*|*grant*)
      emit "$f"
      ;;
  esac
done < <(find server shared src tests -type f \( -name '*.test.ts' -o -name '*.spec.ts' \) 2>/dev/null | sort)

{
  printf "\n### Outros testes (conteúdo, até 60)\n"
} >> "$OUT"
n=0
while IFS= read -r f; do
  case "$f" in
    *canary*|*concurrent*|*parity*|*tenant*|*rls*|*security*|*isolation*|*grant*) continue ;;
  esac
  n=$((n+1))
  [ "$n" -gt 60 ] && { printf "\n_(+ testes omitidos)_\n" >> "$OUT"; break; }
  emit "$f"
done < <(find server shared src tests -type f \( -name '*.test.ts' -o -name '*.spec.ts' \) 2>/dev/null | sort)

# ---------- 08 — ci/docs ----------------------------------------------

echo "→ ci/docs"
section "CI, RUNBOOKS E DOCS"
if [ -d .github ]; then
  while IFS= read -r f; do emit "$f"; done < <(find .github -type f \( -name '*.yml' -o -name '*.yaml' -o -name '*.md' \) 2>/dev/null | sort)
fi
[ -f .gitlab-ci.yml ] && emit ".gitlab-ci.yml"
if [ -d docs ]; then
  while IFS= read -r f; do emit "$f"; done < <(find docs -type f -name '*.md' 2>/dev/null | sort | head -100)
fi
while IFS= read -r f; do
  case "$f" in specs/*|docs/*) continue ;; esac
  emit "$f"
done < <(all_files | grep -E '^[^/]+\.md$')

# ---------- 09 — estado do banco (opcional) ---------------------------

if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  echo "→ estado do banco"
  section "ESTADO DO BANCO (LIVE)"
  {
    printf "\n### Roles\n\n```\n"
    psql "$DATABASE_URL" -c "SELECT rolname, rolsuper AS super, rolbypassrls AS bypass, rolcreaterole AS createrole, rolcanlogin AS login FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname;" 2>&1 || echo "(erro)"
    printf "```\n"

    printf "\n### Tabelas — RLS / force\n\n```\n"
    psql "$DATABASE_URL" -c "SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public' ORDER BY c.relname;" 2>&1 || echo "(erro)"
    printf "```\n"

    printf "\n### Policies\n\n```\n"
    psql "$DATABASE_URL" -c "SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;" 2>&1 || echo "(erro)"
    printf "```\n"

    printf "\n### Grants de merp_app\n\n```\n"
    psql "$DATABASE_URL" -c "SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee='merp_app' ORDER BY table_name, privilege_type;" 2>&1 || echo "(erro)"
    printf "```\n"

    printf "\n### Default privileges\n\n```\n"
    psql "$DATABASE_URL" -c "SELECT defaclrole::regrole AS grantor, defaclnamespace::regnamespace AS schema, defaclobjtype AS objtype, defaclacl FROM pg_default_acl;" 2>&1 || echo "(erro)"
    printf "```\n"

    printf "\n### Migrations aplicadas (drizzle)\n\n```\n"
    psql "$DATABASE_URL" -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 30;" 2>&1 || \
      psql "$DATABASE_URL" -c "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 30;" 2>&1 || echo "(tabela não encontrada)"
    printf "```\n"
  } >> "$OUT"
else
  section "ESTADO DO BANCO (LIVE)"
  printf "\n_(pulado: psql ausente ou DATABASE_URL não definida)_\n\n" >> "$OUT"
  printf "Para incluir, rode:\n\n\`\`\`\nexport DATABASE_URL=\"postgres://...\"\nbash snapshot.sh\n\`\`\`\n" >> "$OUT"
fi

# ---------- 10 — scan de segredos -------------------------------------

section "SCAN DE SEGREDOS (verificar antes de enviar)"
{
  printf "\n```\n"
  if grep -nE 'sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-' "$OUT" 2>/dev/null | head -20; then
    printf "⚠️  Padrões encontrados acima. Revise antes de enviar.\n"
  else
    printf "✅ Nenhum padrão óbvio de segredo encontrado.\n"
  fi
  printf "```\n"
} >> "$OUT"

# ---------- zip -------------------------------------------------------

if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT_DIR" && zip -q "snapshot-$STAMP.zip" "snapshot-$STAMP.md" )
  ZIP="$OUT_DIR/snapshot-$STAMP.zip"
else
  ( cd "$OUT_DIR" && tar czf "snapshot-$STAMP.tar.gz" "snapshot-$STAMP.md" )
  ZIP="$OUT_DIR/snapshot-$STAMP.tar.gz"
fi

LINES=$(wc -l < "$OUT")
SIZE=$(du -h "$OUT" | cut -f1)
echo ""
echo "✅ Pronto"
echo ""
echo "   MD:  $OUT"
echo "   ZIP: $ZIP"
echo "   Tamanho: $SIZE ($LINES linhas)"
echo ""
