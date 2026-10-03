#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const [,, template, slug, ...titleParts] = process.argv;
const title = titleParts.join(" ");

if (!template || !slug || !title) {
  console.error("Uso: pnpm run docs:new <template> <slug> <titulo>");
  console.error("Templates: adr, spec, data-model, api, runbook, rule, guide");
  process.exit(1);
}

const templates: Record<string, string> = {
  adr: "adr.md",
  spec: "spec.md",
  "data-model": "data-model.md",
  api: "api.md",
  runbook: "runbook.md",
  rule: "business-rule.md",
  guide: "guide.md",
};

const templateFile = templates[template];
if (!templateFile) {
  console.error(`Template desconhecido: ${template}`);
  console.error("Disponíveis: " + Object.keys(templates).join(", "));
  process.exit(1);
}

const templatePath = join(__dirname, "..", "templates", templateFile);
if (!existsSync(templatePath)) {
  console.error(`Template não encontrado: ${templatePath}`);
  process.exit(1);
}

let content = readFileSync(templatePath, "utf-8");
const today = new Date().toISOString().slice(0, 10);

content = content
  .replace(/YYYY-MM-DD/g, today)
  .replace(/<context>/g, slug.split("-")[0])
  .replace(/<slug>/g, slug)
  .replace(/spec-context/g, slug)
  .replace(/adr-xxx-slug-curto/g, slug)
  .replace(/data-model-context/g, slug)
  .replace(/api-context/g, slug)
  .replace(/runbook-tarefa/g, slug)
  .replace(/rule-nome/g, slug)
  .replace(/guide-titulo/g, slug)
  .replace(/<Título>/g, title)
  .replace(/<Nome>/g, title)
  .replace(/<Bounded Context>/g, title)
  .replace(/<Tarefa Operacional>/g, title)
  .replace(/<Tarefa>/g, title);

// Determinar pasta de destino baseada na categoria
const categoryMap: Record<string, string> = {
  adr: "02-architecture/adr",
  spec: "03-domain",
  "data-model": "02-architecture/data-model",
  api: "04-api",
  runbook: "05-operations/runbooks",
  rule: "07-reference",
  guide: "01-getting-started",
};

const baseDir = categoryMap[template] || "03-domain";
let destDir = join(__dirname, "..", "..", baseDir);

if (template === "spec" || template === "data-model") {
  // Para specs, criar subpasta por módulo
  const moduleName = slug.replace("spec-", "").replace("data-model-", "");
  const moduleDir = join(destDir, moduleName);
  if (!existsSync(moduleDir)) {
    mkdirSync(moduleDir, { recursive: true });
  }
  destDir = moduleDir;
}

const destFile = join(destDir, `${slug}.md`);

if (existsSync(destFile)) {
  console.error(`Arquivo já existe: ${destFile}`);
  process.exit(1);
}

writeFileSync(destFile, content);
console.log(`✅ Criado: ${destFile}`);
console.log(`   Edite o frontmatter (owner, reviewers, module, tags) antes de commitar`);