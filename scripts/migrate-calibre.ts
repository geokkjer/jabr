import Database from 'better-sqlite3'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

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
    } else if (arg === '--db-url') {
      parsed['db-url'] = args[++i]
    }
  }
  return parsed
}

function printHelp() {
  console.log(`Usage: pnpm tsx scripts/migrate-calibre.ts [options]

Options:
  --library, -l   Path to Calibre library directory (required)
  --db-url        PostgreSQL connection string (default: postgres://jabr:jabr@localhost:5432/jabr)
  --dry-run       Show plan without executing
  --help, -h      Show this help message
`)
}

function readCalibreDatabase(dbPath: string): CalibreBook[] {
  const db = new Database(dbPath, { readonly: true })
  const books: CalibreBook[] = []

  const rows = db.prepare(`
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
  `).all() as Array<{
    id: number
    title: string
    author: string
    path: string
    format: string
    size: number
    mtime: string
  }>

  const identifiers = db.prepare(`
    SELECT book, type, val
    FROM identifiers
  `).all() as Array<{ book: number; type: string; val: string }>

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

  const dbUrl = (args['db-url'] as string) ?? 'postgres://jabr:jabr@localhost:5432/jabr'
  const dryRun = args['dry-run'] === true

  const calibreDbPath = join(libraryPath, 'metadata.db')
  if (!existsSync(calibreDbPath)) {
    console.error(`Error: metadata.db not found at ${calibreDbPath}`)
    process.exit(1)
  }

  const books = readCalibreDatabase(calibreDbPath)
  console.log(`Found ${books.length} books in Calibre library`)

  if (dryRun) {
    for (const book of books) {
      console.log(`  [DRY RUN] ${book.title} by ${book.author} (${book.format}, ${book.size} bytes)`)
    }
    console.log(`\n[DRY RUN] Would insert ${books.length} books into PostgreSQL`)
    return
  }

  const pool = new pg.Pool({ connectionString: dbUrl })

  let inserted = 0
  let skipped = 0

  for (const book of books) {
    const filePath = join(libraryPath, book.path, `${book.title}.${book.format}`)

    if (!existsSync(filePath)) {
      console.warn(`  Skipping: file not found: ${filePath}`)
      skipped++
      continue
    }

    const content = await readFile(filePath)

    const result = await pool.query(
      `INSERT INTO api.books (title, author, format, content, size, identifiers, mtime, indexed_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        book.title,
        book.author,
        book.format,
        content,
        book.size,
        JSON.stringify(book.identifiers),
        book.mtime.getTime(),
        Date.now(),
      ],
    )

    if (result.rowCount && result.rowCount > 0) {
      inserted++
      console.log(`  Inserted: ${book.title} by ${book.author} (${book.format})`)
    } else {
      skipped++
      console.log(`  Skipped (duplicate): ${book.title} by ${book.author}`)
    }
  }

  await pool.end()
  console.log(`\nMigration complete! Inserted: ${inserted}, Skipped: ${skipped}`)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
