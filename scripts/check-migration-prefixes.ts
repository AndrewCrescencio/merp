import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// drizzle-kit check valida o journal (números internos); o prefixo do FICHEIRO
// é o que o humano lê e o que separa as cadeias (drizzle/ e drizzle/custom/).
// Dois ficheiros com o mesmo prefixo é o erro clássico de rebase: um passa a
// invisível porque o journal já registou o outro e nunca chega ao banco.
/** "0001_x.sql" → 1, "C001_x.sql" → 1; sem prefixo numérico → null. */
export function prefixOf(file: string): string | null {
  const match = /^(?:C)?(\d+)_/.exec(file)
  if (!match?.[1]) return null
  // Normalizado ao número: "0001_x.sql" e "C001_y.sql" são o MESMO prefixo (1)
  // escrito de duas formas — no mesmo diretório têm de colidir.
  return String(Number.parseInt(match[1], 10))
}

export function findDuplicates(files: string[]): Map<string, string[]> {
  const byPrefix = new Map<string, string[]>()
  for (const file of files) {
    const prefix = prefixOf(file)
    if (prefix === null) continue
    const list = byPrefix.get(prefix)
    if (list) list.push(file)
    else byPrefix.set(prefix, [file])
  }
  return new Map([...byPrefix].filter(([, list]) => list.length > 1))
}

/** Problemas por diretório; `root` é a raiz do repo. */
export function findPrefixProblems(root: string): string[] {
  const problems: string[] = []
  for (const dir of ['drizzle', 'drizzle/custom']) {
    let files: string[]
    try {
      files = readdirSync(resolve(root, dir)).filter((file) => file.endsWith('.sql'))
    } catch {
      continue // drizzle/custom só existe se houver migrações custom
    }
    for (const [prefix, dupes] of findDuplicates(files)) {
      problems.push(`${dir}: prefixo ${prefix} duplicado em ${dupes.join(' e ')}`)
    }
  }
  return problems
}

function main(): void {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const problems = findPrefixProblems(root)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`)
    console.error('Renomeie um dos ficheiros — o prefixo do journal não muda, só o nome.')
    process.exit(1)
  }
  console.log(
    '✓ check-migration-prefixes: sem prefixos duplicados em drizzle/ nem drizzle/custom/.',
  )
}

// Só roda quando invocado como script: o teste unitário importa as funções.
const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false
if (invokedDirectly) main()
