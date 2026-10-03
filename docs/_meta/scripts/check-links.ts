import { glob } from "glob";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const files = await glob("docs/**/*.md");
  let broken = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const links = content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);

    for (const [, text, url] of links) {
      if (url.startsWith("http")) {
        // Externo - HEAD request com timeout
        // Skip placeholder URLs
        if (url.includes("seu-org") || url.includes("example.com") || url.includes("placeholder")) {
          continue;
        }
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(url, { method: "HEAD", signal: controller.signal });
          clearTimeout(timeout);
          if (!res.ok) throw new Error(`${res.status}`);
        } catch {
          console.error(`❌ ${file}: Link externo quebrado → ${url}`);
          broken++;
        }
      } else if (url.startsWith("#")) {
        // Anchor interno - verificar se existe no mesmo arquivo
        const anchor = url.slice(1).toLowerCase();
        const headings = content.matchAll(/^#{1,6}\s+(.+)$/gm);
        const found = [...headings].some(h =>
          h[1].toLowerCase().replace(/[^a-z0-9]+/g, "-") === anchor
        );
        if (!found) {
          console.error(`❌ ${file}: Anchor não encontrado → ${url}`);
          broken++;
        }
      } else {
        // Relativo - resolver e verificar arquivo existe
        const targetPath = url.replace(/\.md$/, "") + ".md";
        const target = resolve(dirname(file), targetPath);
        const exists = files.some(f => resolve(f) === target);
        if (!exists) {
          console.error(`❌ ${file}: Link relativo quebrado → ${url} (resolvido: ${target})`);
          broken++;
        }
      }
    }
  }

  if (broken > 0) {
    console.error(`\n❌ ${broken} link(s) quebrado(s)`);
    process.exit(1);
  }
  console.log(`✅ Links OK em ${files.length} arquivos`);
}

main();