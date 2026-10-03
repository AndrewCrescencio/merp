import { glob } from "glob";
import { readFileSync, writeFileSync } from "fs";
import { parse } from "yaml";

async function main() {
  const files = await glob("docs/**/*.md");
  const index = [];

  for (const file of files) {
    // Skip template files and _meta files
    if (file.includes("_meta/templates/") || file.includes("_meta/scripts/")) continue;
    
    const content = readFileSync(file, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = parse(fmMatch[1]);
    if (fm.status === "archived") continue;

    index.push({
      title: fm.title,
      slug: fm.slug,
      path: file.replace("docs/", "").replace(".md", ""),
      category: fm.category,
      module: fm.module,
      tags: fm.tags,
      status: fm.status,
      updated: fm.updated,
    });
  }

  index.sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.module.localeCompare(b.module) ||
    a.title.localeCompare(b.title)
  );

  writeFileSync("docs/_meta/inventory.json", JSON.stringify(index, null, 2));

  // Gerar mkdocs.yml nav
  const nav = generateNav(index);
  writeFileSync("mkdocs.yml", generateMkDocsConfig(nav));
  console.log("✅ inventory.json e mkdocs.yml gerados");
}

function generateNav(index: any[]) {
  const byCategory = new Map<string, Map<string, any[]>>();

  for (const item of index) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, new Map());
    const byModule = byCategory.get(item.category)!;
    if (!byModule.has(item.module)) byModule.set(item.module, []);
    byModule.get(item.module)!.push(item);
  }

  const nav: any[] = [];

  const categoryOrder = [
    "guide", "spec", "adr", "reference", "api", "audit", "plan"
  ];

  const categoryLabels: Record<string, string> = {
    guide: "Guias",
    spec: "Especificações",
    adr: "ADRs",
    reference: "Referência",
    api: "API Reference",
    audit: "Auditoria",
    plan: "Planos",
  };

  for (const cat of categoryOrder) {
    if (!byCategory.has(cat)) continue;
    const modules = byCategory.get(cat)!;
    const children: any[] = [];

    for (const [module, items] of modules) {
      if (items.length === 1) {
        children.push({ [items[0].title]: items[0].path });
      } else {
        children.push({ [module]: items.map(i => ({ [i.title]: i.path })) });
      }
    }

    if (children.length > 0) {
      nav.push({ [categoryLabels[cat] || cat]: children });
    }
  }

  return nav;
}

function generateMkDocsConfig(nav: any[]) {
  return `site_name: MERP Documentation
site_url: https://docs.merp.com.br
repo_url: https://github.com/seu-org/merp
repo_name: merp

theme:
  name: material
  language: pt
  palette:
    - scheme: default
      primary: indigo
      accent: indigo
  features:
    - navigation.tabs
    - navigation.sections
    - navigation.expand
    - search.highlight
    - search.share
    - content.code.copy

markdown_extensions:
  - pymdownx.highlight:
      anchor_linenums: true
  - pymdownx.inlinehilite
  - pymdownx.snippets
  - pymdownx.superfences
  - pymdownx.tabbed:
      alternate_style: true
  - admonition
  - pymdownx.details
  - attr_list
  - md_in_html
  - toc:
      permalink: true

nav:
${nav.map(item => `  - ${JSON.stringify(item).replace(/^{|}$/g, "").replace(/"/g, "")}`).join("\n")}

plugins:
  - search:
      lang: pt
  - git-revision-date-localized:
      type: date
      fallback_to_build_date: true
  - git-authors

extra:
  social:
    - icon: fontawesome/brands/github
      link: https://github.com/seu-org/merp
`;
}

main();