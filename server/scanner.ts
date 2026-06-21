import { readdir, stat, mkdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { join, extname, relative, resolve, dirname } from 'node:path'
import { getBooksDir, ALLOWED_EXTENSIONS_SET, BOOK_SCAN_CACHE_TTL_MS } from './config.js'
import { upsertBookIndex, cleanupBookIndex } from './db.js'
import type { BookIndex } from './db.js'

export interface Book {
  id: string
  title: string
  author: string
  path: string
  format: 'pdf' | 'epub' | 'txt' | 'md' | 'unknown'
  size: number
  mtime: Date
}

const MAX_DIR_WALK_DEPTH = 50

export function getBooksDirSafe(): string {
  const dir = getBooksDir()
  try {
    const s = statSync(dir)
    if (s.isFile()) {
      return dirname(dir)
    }
  } catch {
    // ignore
  }
  return dir
}

export async function ensureBooksDir(): Promise<string> {
  const dir = getBooksDirSafe()
  await mkdir(dir, { recursive: true })
  return dir
}

export function parseBookEntry(
  filename: string,
  ext: string,
  relPath: string,
  parentDir: string,
  size: number,
  mtime: Date
): Book {
  const name = filename.replace(ext, '')
  let author = 'Unknown'
  let title = name

  const parts = name.split(' - ')
  if (parts.length >= 2) {
    author = parts[0]
    title = parts.slice(1).join(' - ')
  } else if (parentDir && parentDir !== '.') {
    author = parentDir.split('/')[0]
  }

  return {
    id: relPath,
    title,
    author,
    path: relPath,
    format: ext.slice(1) as Book['format'],
    size,
    mtime,
  }
}

export async function scanBooks(rootDir: string): Promise<Book[]> {
  const books: Book[] = []

  if (!existsSync(rootDir)) {
    console.error(`Scan failed: Directory does not exist: ${rootDir}`)
    return []
  }

  const s = statSync(rootDir)
  if (!s.isDirectory()) {
    console.error(`Scan failed: Path is not a directory: ${rootDir}`)
    return []
  }

  async function walk(dir: string, depth = 0) {
    if (depth > MAX_DIR_WALK_DEPTH) return
    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)

        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1)
        } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase()
            if (ALLOWED_EXTENSIONS_SET.has(ext)) {
            const stats = await stat(fullPath)
            const relPath = relative(rootDir, fullPath)
            const parentDir = relative(rootDir, dir)

            books.push(parseBookEntry(entry.name, ext, relPath, parentDir, stats.size, stats.mtime))
          }
        }
      }
    } catch (e) {
      console.error(`Error walking directory ${dir}:`, e)
    }
  }

  await walk(rootDir)
  return books
}

let scanCache: { result: Book[]; timestamp: number } | null = null

export async function scanAndIndex(): Promise<Book[]> {
  const now = Date.now()

  if (scanCache && now - scanCache.timestamp < BOOK_SCAN_CACHE_TTL_MS) {
    return scanCache.result
  }

  const dir = getBooksDirSafe()
  const books = await scanBooks(dir)

  for (const book of books) {
    const bookIndex: BookIndex = {
      id: book.id,
      path: book.path,
      title: book.title,
      author: book.author,
      format: book.format,
      size: book.size,
      mtime: book.mtime.getTime(),
      indexedAt: Date.now(),
    }
    upsertBookIndex(bookIndex)
  }

  cleanupBookIndex(books.map((b) => b.path))

  scanCache = { result: books, timestamp: now }
  return books
}

export function invalidateScanCache(): void {
  scanCache = null
}
