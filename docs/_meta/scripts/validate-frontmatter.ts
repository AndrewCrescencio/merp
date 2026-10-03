import { glob } from "glob";
import { readFileSync } from "fs";
import { parse } from "yaml";
import { z } from "zod";

const FrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(["spec", "adr", "guide", "plan", "api", "reference", "audit", "draft", "review"]),
  status: z.enum(["active", "deprecated", "archived", "draft", "accepted", "deferred", "proposed", "superseded"]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  owner: z.string().startsWith("@"),
  reviewers: z.array(z.string().startsWith("@")).min(1),
  module: z.string().min(1),
  tags: z.array(z.string()),
  audience: z.array(z.enum(["dev", "qa", "product", "support", "devops", "architect", "dba", "backend", "frontend", "security"])),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  "review-cycle": z.enum(["quarterly", "semiannual", "on-change", "once"]),
  related: z.array(z.string()),
  replaces: z.array(z.string()),
  "replaced-by": z.string().nullable(),
});

async function main() {
  const files = await glob("docs/**/*.md");
  const slugs = new Map<string, string>();
  let errors = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      console.error(`❌ ${file}: Sem frontmatter`);
      errors++;
      continue;
    }
    const fm = parse(fmMatch[1]);
    const result = FrontmatterSchema.safeParse(fm);
    if (!result.success) {
      console.error(`❌ ${file}: Frontmatter inválido`);
      console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
      errors++;
      continue;
    }
    // Verificar slug único
    if (slugs.has(fm.slug)) {
      console.error(`❌ ${file}: Slug duplicado "${fm.slug}" (já em ${slugs.get(fm.slug)})`);
      errors++;
    } else {
      slugs.set(fm.slug, file);
    }
    // Verificar updated >= created
    if (fm.updated < fm.created) {
      console.error(`❌ ${file}: updated (${fm.updated}) < created (${fm.created})`);
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\n❌ ${errors} erro(s) em ${files.length} arquivos`);
    process.exit(1);
  }
  console.log(`✅ ${files.length} arquivos validados, ${slugs.size} slugs únicos`);
}

main();