#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse, stringify } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

const [, , slug, newSlug] = process.argv

if (!slug || !newSlug) {
  console.error('Uso: pnpm run docs:deprecate <slug-atual> <slug-novo>')
  process.exit(1)
}

const inventoryPath = join(__dirname, '..', '..', '_meta', 'inventory.json')
if (!existsSync(inventoryPath)) {
  console.error('inventory.json não encontrado. Rode pnpm run docs:index primeiro.')
  process.exit(1)
}

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf-8'))
const doc = inventory.find((d: { slug: string }) => d.slug === slug)
if (!doc) {
  console.error(`Doc com slug "${slug}" não encontrado no inventory.json`)
  process.exit(1)
}

const filePath = join(__dirname, '..', '..', doc.path + '.md')
if (!existsSync(filePath)) {
  console.error(`Arquivo não encontrado: ${filePath}`)
  process.exit(1)
}

const content = readFileSync(filePath, 'utf-8')
const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
if (!fmMatch) {
  console.error('Frontmatter não encontrado')
  process.exit(1)
}

const fm = parse(fmMatch[1])
fm.status = 'deprecated'
fm['replaced-by'] = newSlug
fm.updated = new Date().toISOString().slice(0, 10)

const newFm = stringify(fm)
const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFm}---`)

// Adicionar banner de deprecated no topo do conteúdo (após frontmatter)
const banner = `\n> ⚠️ **DEPRECATED** — Esta documentação foi substituída por [${newSlug}](${newSlug}).\n`
const finalContent = newContent.replace(/^---[\s\S]*?---/, (match) => match + banner)

writeFileSync(filePath, finalContent)
console.log(`✅ ${slug} marcado como deprecated, replaced-by: ${newSlug}`)
console.log(`   Commit a alteração e rode pnpm run docs:index`)
