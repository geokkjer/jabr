import Database from 'better-sqlite3'
import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { resolve } from 'node:path'

interface CalibreBook {
  id: number
  title: string
  author: string
  path: string
  format: string
  size: number
  mtime: Date
  identifiers: Record<string, string>
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') {
      parsed['dry-run'] = true
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (arg === '--library' || arg === '-l') {
      parsed.library = args[++i]
    } else if (arg === '--books-dir') {
      parsed['books-dir'] = args[++i]
    }
  }
  return parsed
}

function printHelp() {
  console.log(`Usage: pnpm tsx scripts/migrate-calibre.ts [options]

Options:
  --library, -l   Path to Calibre library directory (required)
  --books-dir     Target books directory (default: ./books)
  --dry-run       Show plan without executing
  --help, -h      Show this help message
`)
}

function readCalibreDatabase(dbPath: string): CalibreBook[] {
  const db = new Database(dbPath, { readonly: true })
  const books: CalibreBook[] = []

  const rows = db
    .prepare(
      `
    SELECT
      b.id,
      b.title,
      COALESCE(a.name, 'Unknown') AS author,
      b.path,
      d.format,
      d.uncompressed_size AS size,
      d.last_modified AS mtime
    FROM books b
    LEFT JOIN books_authors_link bal ON b.id = bal.book
    LEFT JOIN authors a ON bal.author = a.id
    LEFT JOIN data d ON b.id = d.book
    ORDER BY b.id
  `
    )
    .all() as Array<{
    id: number
    title: string
    author: string
    path: string
    format: string
    size: number
    mtime: string
  }>

  const identifiers = db
    .prepare('SELECT book, type, val FROM identifiers')
    .all() as Array<{ book: number; type: string; val: string }>

  const idMap = new Map<number, Record<string, string>>()
  for (const row of identifiers) {
    if (!idMap.has(row.book)) idMap.set(row.book, {})
    idMap.get(row.book)![row.type] = row.val
  }

  for (const row of rows) {
    if (!row.format) continue
    books.push({
      id: row.id,
      title: row.title,
      author: row.author,
      path: row.path,
      format: row.format.toLowerCase(),
      size: row.size || 0,
      mtime: new Date(row.mtime),
      identifiers: idMap.get(row.id) ?? {},
    })
  }

  db.close()
  return books
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const libraryPath = args.library as string
  if (!libraryPath) {
    console.error('Error: --library is required')
    printHelp()
    process.exit(1)
  }

  if (!existsSync(libraryPath)) {
    console.error(`Error: library path does not exist: ${libraryPath}`)
    process.exit(1)
  }

  const booksDir = resolve(args['books-dir'] as string || './books')
  const dryRun = args['dry-run'] === true

  const calibreDbPath = join(libraryPath, 'metadata.db')
  if (!existsSync(calibreDbPath)) {
    console.error(`Error: metadata.db not found at ${calibreDbPath}`)
    process.exit(1)
  }

  const books = readCalibreDatabase(calibreDbPath)
  console.log(`Found ${books.length} books in Calibre library`)

  let copied = 0
  let skipped = 0

  for (const book of books) {
    const ext = `.${book.format}`
    const sourcePath = join(libraryPath, book.path, `${book.title}${ext}`)

    if (!existsSync(sourcePath)) {
      console.warn(`  Skipping: file not found: ${sourcePath}`)
      skipped++
      continue
    }

    const safeName = `${book.author} - ${book.title}${ext}`
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
    const destPath = join(booksDir, safeName)

    if (dryRun) {
      console.log(`  [DRY RUN] ${sourcePath} -> ${destPath}`)
      continue
    }

    if (existsSync(destPath)) {
      skipped++
      console.log(`  Skipped (exists): ${book.title} by ${book.author}`)
      continue
    }

    await mkdir(booksDir, { recursive: true })
    await copyFile(sourcePath, destPath)
    copied++
    console.log(`  Copied: ${book.title} by ${book.author} (${book.format})`)
  }

  console.log(`\nMigration complete! Copied: ${copied}, Skipped: ${skipped}`)
  if (copied > 0) {
    console.log('Restart the server to reindex the books directory.')
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
