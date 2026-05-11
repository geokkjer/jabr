import { resolve, join, dirname } from 'node:path'
import { statSync } from 'node:fs'

export const PORT = Number(process.env.JABR_PORT) || 3001
export const NODE_ENV = process.env.NODE_ENV || 'development'

export const DB_PATH = process.env.JABR_DB_PATH
  ? resolve(process.env.JABR_DB_PATH)
  : resolve(process.cwd(), 'data', 'jabr.sqlite3')

export function getBooksDir(): string {
  const configured = process.env.JABR_BOOKS_PATH
  const fallback = join(process.cwd(), 'books')
  const path = resolve(configured ?? fallback)

  const normalized = path.trim().replace(/[/\\]+$/, '')

  try {
    const s = statSync(normalized)
    if (s.isFile()) {
      return dirname(normalized)
    }
  } catch {
    // ignore
  }

  return normalized
}

export const UPLOAD_MAX_BYTES = 1024 * 1024 * 512 // 512MB
export const BOOK_SCAN_CACHE_TTL_MS = 5000

export const ALLOWED_EXTENSIONS = ['.pdf', '.epub', '.txt', '.md'] as const
export const ALLOWED_EXTENSIONS_SET = new Set(ALLOWED_EXTENSIONS)

export const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

export const AUTH_COOKIE_NAME = 'jabr_auth'
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 1 week
