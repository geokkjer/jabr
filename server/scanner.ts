import { readdir, stat, mkdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { join, extname, relative, resolve, dirname } from 'node:path'
import { getBooksDir } from './config.js'
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

const ALLOWED_EXTENSIONS = ['.pdf', '.epub', '.txt', '.md'] as const
const ALLOWED_EXTENSIONS_SET = new Set(ALLOWED_EXTENSIONS)

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

  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)

        if (entry.isDirectory()) {
          await walk(fullPath)
        } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase() as '.pdf' | '.epub' | '.txt' | '.md'
            if (ALLOWED_EXTENSIONS_SET.has(ext)) {
            const stats = await stat(fullPath)
            const relPath = relative(rootDir, fullPath)

            const filename = entry.name.replace(ext, '')
            let author = 'Unknown'
            let title = filename

            const parts = filename.split(' - ')
            if (parts.length >= 2) {
              author = parts[0]
              title = parts.slice(1).join(' - ')
            } else {
              const parentDir = relative(rootDir, dir)
              if (parentDir && parentDir !== '.') {
                author = parentDir.split('/')[0]
              }
            }

            books.push({
              id: relPath,
              title,
              author,
              path: relPath,
              format: ext.slice(1) as Book['format'],
              size: stats.size,
              mtime: stats.mtime,
            })
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

export async function scanAndIndex(): Promise<Book[]> {
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
  return books
}
