#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const [,, slug] = process.argv;

if (!slug) {
  console.error("Uso: pnpm run docs:archive <slug>");
  console.error("Exemplo: pnpm run docs:archive spec-erp-b2b-catalog");
  process.exit(1);
}

const inventoryPath = join(__dirname, "..", "..", "_meta", "inventory.json");
if (!existsSync(inventoryPath)) {
  console.error("inventory.json não encontrado. Rode pnpm run docs:index primeiro.");
  process.exit(1);
}

const inventory = JSON.parse(readFileSync(inventoryPath, "utf-8"));
const doc = inventory.find((d: any) => d.slug === slug);
if (!doc) {
  console.error(`Doc com slug "${slug}" não encontrado no inventory.json`);
  process.exit(1);
}

const filePath = join(__dirname, "..", "..", doc.path + ".md");
if (!existsSync(filePath)) {
  console.error(`Arquivo não encontrado: ${filePath}`);
  process.exit(1);
}

// Determinar pasta de archive baseada na categoria
const archiveMap: Record<string, string> = {
  spec: "_archive/deprecated",
  plan: "_archive/future-packs",
  draft: "_archive/drafts",
  audit: "_archive/deprecated",
  analysis: "_archive/deprecated",
};

const archiveBase = archiveMap[doc.category] || "_archive/deprecated";
const archiveDir = join(__dirname, "..", "..", archiveBase);
if (!existsSync(archiveDir)) {
  mkdirSync(archiveDir, { recursive: true });
}

const archivePath = join(archiveDir, `${slug}.md`);

if (existsSync(archivePath)) {
  console.error(`Já existe em archive: ${archivePath}`);
  process.exit(1);
}

// Mover arquivo
renameSync(filePath, archivePath);

// Atualizar frontmatter para archived
const content = readFileSync(archivePath, "utf-8");
const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
if (fmMatch) {
  const fm = JSON.parse(JSON.stringify(fmMatch[1])); // placeholder
  // Simples: apenas substituir status
  const newContent = content.replace(/status:\s*"active"/, 'status: "archived"');
  writeFileSync(archivePath, newContent);
}

// Tag git
const tagName = `doc/archive/${slug}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
try {
  execSync(`git tag -a "${tagName}" -m "Archive: ${doc.title} (reason: moved to ${archiveBase})"`, { stdio: "inherit" });
  console.log(`✅ Tag criada: ${tagName}`);
  console.log(`   Rode: git push origin ${tagName}`);
} catch {
  console.warn("⚠️ Falha ao criar tag git (pode não estar em repo git ou tag já existe)");
}

console.log(`✅ Arquivado: ${filePath} → ${archivePath}`);
console.log(`   Rode pnpm run docs:index para atualizar inventory`);