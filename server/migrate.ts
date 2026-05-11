import Database from 'better-sqlite3'
import { mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getBooksDir } from './config.js'

interface CalibreRow {
  id: number
  title: string
  author: string
  path: string | null
  file_name: string
  format: string
  size: number
  mtime: string
}

interface IdentifierRow {
  book: number
  type: string
  val: string
}

interface MigrateOptions {
  preferFormat?: string
  dryRun?: boolean
}

interface MigrateResult {
  dryRun: boolean
  total: number
  copied: number
  skipped: number
  errors: number
  details: Array<{ action: 'copy' | 'skip' | 'error' | 'dry-run'; title: string; author: string; format: string; reason?: string }>
  errors_list: string[]
}

export async function migrateFromCalibre(
  libraryPath: string,
  options: MigrateOptions = {}
): Promise<MigrateResult> {
  const preferFormat = options.preferFormat
  const dryRun = options.dryRun === true
  const result: MigrateResult = {
    dryRun,
    total: 0,
    copied: 0,
    skipped: 0,
    errors: 0,
    details: [],
    errors_list: [],
  }

  const calibreDbPath = join(libraryPath, 'metadata.db')
  if (!existsSync(calibreDbPath)) {
    throw new Error(`metadata.db not found at ${calibreDbPath}`)
  }

  const db = new Database(calibreDbPath, { readonly: true })

  const rows = db
    .prepare(
      `SELECT
        b.id,
        b.title,
        COALESCE(a.name, 'Unknown') AS author,
        b.path,
        d.name AS file_name,
        d.format,
        d.uncompressed_size AS size,
        b.last_modified AS mtime
      FROM books b
      LEFT JOIN books_authors_link bal ON b.id = bal.book
      LEFT JOIN authors a ON bal.author = a.id
      LEFT JOIN data d ON b.id = d.book
      ORDER BY b.id, d.format`
    )
    .all() as CalibreRow[]

  const identifiers = db
    .prepare('SELECT book, type, val FROM identifiers')
    .all() as IdentifierRow[]

  const idMap = new Map<number, Record<string, string>>()
  for (const row of identifiers) {
    if (!idMap.has(row.book)) idMap.set(row.book, {})
    idMap.get(row.book)![row.type] = row.val
  }

  db.close()

  // Deduplicate if preferFormat is set
  let books: CalibreRow[]
  if (preferFormat) {
    const seen = new Map<number, CalibreRow>()
    const preferred = preferFormat.toLowerCase()
    for (const row of rows) {
      if (!row.format || !row.path) continue
      const existing = seen.get(row.id)
      if (!existing) {
        seen.set(row.id, row)
      } else if (row.format.toLowerCase() === preferred && existing.format.toLowerCase() !== preferred) {
        seen.set(row.id, row)
      }
    }
    books = Array.from(seen.values())
  } else {
    books = rows.filter((r) => r.format && r.path)
  }

  result.total = books.length

  const booksDir = resolve(getBooksDir())
  await mkdir(booksDir, { recursive: true })

  for (const book of books) {
    const ext = `.${book.format.toLowerCase()}`
    const sourcePath = join(libraryPath, book.path!, `${book.file_name}${ext}`)

    if (!existsSync(sourcePath)) {
      result.skipped++
      result.details.push({
        action: 'skip',
        title: book.title,
        author: book.author,
        format: book.format,
        reason: 'File not found on disk',
      })
      continue
    }

    const safeName = `${book.author} - ${book.title}${ext}`
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
    const destPath = join(booksDir, safeName)

    if (dryRun) {
      result.details.push({
        action: 'dry-run',
        title: book.title,
        author: book.author,
        format: book.format,
      })
      continue
    }

    if (existsSync(destPath)) {
      result.skipped++
      result.details.push({
        action: 'skip',
        title: book.title,
        author: book.author,
        format: book.format,
        reason: 'Already exists in books directory',
      })
      continue
    }

    try {
      await copyFile(sourcePath, destPath)
      result.copied++
      result.details.push({
        action: 'copy',
        title: book.title,
        author: book.author,
        format: book.format,
      })
    } catch (e) {
      result.errors++
      const msg = e instanceof Error ? e.message : String(e)
      result.errors_list.push(`${book.title}: ${msg}`)
      result.details.push({
        action: 'error',
        title: book.title,
        author: book.author,
        format: book.format,
        reason: msg,
      })
    }
  }

  return result
}
