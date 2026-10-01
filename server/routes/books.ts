import { Router } from 'express'
import multer from 'multer'
import { join, extname, resolve, relative, sep } from 'node:path'
import { createWriteStream, existsSync, statSync, createReadStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Request, Response } from 'express'

import {
  getBooksDir,
  UPLOAD_MAX_BYTES,
  ALLOWED_EXTENSIONS_SET,
  CONTENT_TYPES,
  MAX_FILENAME_LENGTH,
} from '../config.js'
import { searchBookIndex, getBookIndex } from '../db.js'
import { scanAndIndex, ensureBooksDir, invalidateScanCache } from '../scanner.js'

export const booksRouter = Router()
export const bookFileRouter = Router()

// GET /api/books
booksRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const books = await scanAndIndex()
    res.json(books)
  } catch (e) {
    console.error('Failed to scan books:', e)
    res.status(500).json({ error: 'Failed to scan books' })
  }
})

// GET /api/books/search
booksRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').toLowerCase()
    if (!q) {
      const books = await scanAndIndex()
      res.json(books)
      return
    }
    const indexes = searchBookIndex(q)
    const books = indexes.map((idx) => ({
      id: idx.id,
      title: idx.title,
      author: idx.author,
      path: idx.path,
      format: idx.format as 'pdf' | 'epub' | 'txt' | 'md' | 'unknown',
      size: idx.size,
      mtime: new Date(idx.mtime),
    }))
    res.json(books)
  } catch (e) {
    console.error('Failed to search books:', e)
    res.status(500).json({ error: 'Failed to search books' })
  }
})

// GET /api/books/:id (must be after /search to not match "search" as :id)
booksRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const idx = getBookIndex(id)
    if (!idx) {
      res.status(404).json({ error: 'Book not found' })
      return
    }
    res.json({
      id: idx.id,
      title: idx.title,
      author: idx.author,
      path: idx.path,
      format: idx.format as 'pdf' | 'epub' | 'txt' | 'md' | 'unknown',
      size: idx.size,
      mtime: new Date(idx.mtime),
    })
  } catch (e) {
    console.error('Failed to get book:', e)
    res.status(500).json({ error: 'Failed to get book' })
  }
})

// GET /api/book/* - serve book file
// Express 5 requires a named wildcard; bare '*' throws at startup.
bookFileRouter.get('/*splat', (req: Request, res: Response) => {
  try {
    // req.path keeps percent-encoding; decode so 'Author%20-%20Book.epub'
    // resolves to the real filename on disk.
    const path = decodeURIComponent(req.path).replace(/^\//, '')
    if (!path) {
      res.status(400).json({ error: 'Missing path' })
      return
    }

    if (path.includes('\0')) {
      res.status(400).json({ error: 'Invalid path' })
      return
    }

    const booksDir = getBooksDir()
    const filePath = resolve(booksDir, path)
    const rel = relative(booksDir, filePath)

    if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    const ext = extname(filePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS_SET.has(ext)) {
      res.status(403).json({ error: 'File type not allowed' })
      return
    }

    const stats = statSync(filePath)
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', stats.size.toString())
    createReadStream(filePath).pipe(res)
  } catch (e) {
    console.error('Failed to serve book:', e)
    res.status(500).json({ error: 'Failed to serve book' })
  }
})

// ── Upload ─────────────────────────────────────────────────────
// POST /api/books/upload — multipart field `files`, one or more files.
// Browsers send a directory selection's relative path as the multipart
// filename, so a single preview may be several path segments deep.

export type UploadStatus = 'imported' | 'skipped' | 'failed'

export interface UploadFileResult {
  path: string
  status: UploadStatus
  reason: string | null
}

export interface UploadResponse {
  ok: boolean
  imported: number
  skipped: number
  failed: number
  files: UploadFileResult[]
}

const SAFE_SEGMENT_PATTERN = /[^a-zA-Z0-9._ -]+/g
const FALLBACK_BASENAME = 'untitled'

/** Sanitize a directory segment: same rules as a filename, without an extension. */
function sanitizeDirSegment(segment: string): string {
  const cleaned = segment
    .normalize('NFKC')
    .replace(SAFE_SEGMENT_PATTERN, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(/[.\s]+$/, '')

  return cleaned || FALLBACK_BASENAME
}

/**
 * Sanitize one path segment while preserving spaces, dots, dashes and
 * underscores. Traversal markers, absolute-path markers, drive letters and
 * NUL bytes cannot survive this: backslashes become separators upstream and
 * `..`-only segments are dropped upstream, while anything outside the safe
 * set is replaced. Returns a `basename` with a non-empty stem of at most
 * MAX_FILENAME_LENGTH total characters (extension included).
 */
function sanitizeSegment(segment: string, ext: string): string {
  const stem = segment
    .normalize('NFKC')
    .replace(SAFE_SEGMENT_PATTERN, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, -ext.length)

  const bounded = stem
    .replace(/\.{2,}/g, '.')
    .slice(0, Math.max(1, MAX_FILENAME_LENGTH - ext.length))
    .replace(/[.\s]+$/, '')
    .replace(/^[.\s]+/, '')

  return (bounded || FALLBACK_BASENAME) + ext
}

function stripNulBytes(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) !== 0) out += value[i]
  }
  return out
}

/**
 * Turn `My Books/Author - Title.epub` into safe relative segments below the
 * destination root. Rejects the whole path when the extension is not
 * allowed; drops `.`/`..`/empty segments and strips absolute-path markers so
 * a traversal attempt is flattened into the destination directory rather
 * than escaping it. Returns null when nothing usable is left.
 */
function sanitizeRelativePath(originalName: string): string[] | null {
  const withoutNul = stripNulBytes(originalName)
  const ext = extname(withoutNul).toLowerCase()
  if (!ALLOWED_EXTENSIONS_SET.has(ext)) return null

  const segments = withoutNul
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')

  if (segments.length === 0) return null

  const safe: string[] = []
  for (const segment of segments) {
    // Windows drive letters ('C:') and absolute-path markers are noise.
    const scrubbed = segment.replace(/^[A-Za-z]:/, '')
    if (scrubbed === '') continue
    safe.push(sanitizeDirSegment(scrubbed))
  }

  if (safe.length === 0) return null

  const last = safe[safe.length - 1]
  if (last === undefined) return null

  safe[safe.length - 1] = sanitizeSegment(last, ext)

  return safe
}

const upload = multer({
  limits: { fileSize: UPLOAD_MAX_BYTES },
  // Multer strips the directory from `originalname` by default. Browsers send
  // a folder selection's relative path there, so it must survive to keep the
  // structure; every segment is sanitized below before touching the disk.
  preservePath: true,
})

booksRouter.post('/upload', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? []

    if (uploaded.length === 0) {
      res.status(400).json({ error: 'Missing files' })
      return
    }

    const booksDir = await ensureBooksDir()
    const importedDir = join(booksDir, 'Imported')

    const results: UploadFileResult[] = []

    for (const file of uploaded) {
      const segments = sanitizeRelativePath(file.originalname)
      if (!segments) {
        results.push({
          path: file.originalname,
          status: 'failed',
          reason: 'Unsupported file type',
        })
        continue
      }

      const ext = extname(file.originalname).toLowerCase()
      const relativePath = segments.join('/')
      const targetDir = join(importedDir, ...segments.slice(0, -1))
      const leaf = segments[segments.length - 1]
      if (leaf === undefined) {
        results.push({
          path: file.originalname,
          status: 'failed',
          reason: 'Unsupported file type',
        })
        continue
      }
      const baseName = leaf.slice(0, -ext.length)
      const destPath = uniqueDestPath(targetDir, baseName, ext)

      try {
        await mkdir(targetDir, { recursive: true })
        await pipeline(Readable.from(file.buffer), createWriteStream(destPath))

        // A successfully written file must show up in the next /api/books.
        invalidateScanCache()

        results.push({
          path: join('Imported', relative(importedDir, destPath)).split(sep).join('/'),
          status: 'imported',
          reason: null,
        })
      } catch (e) {
        console.error('Failed to write uploaded file:', e)
        results.push({
          path: join('Imported', relativePath).split(sep).join('/'),
          status: 'failed',
          reason: 'Could not write file',
        })
      }
    }

    const summary: UploadResponse = {
      ok: true,
      imported: results.filter((r) => r.status === 'imported').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      files: results,
    }

    res.json(summary)
  } catch (e) {
    console.error('Failed to upload book:', e)
    res.status(500).json({ error: 'Failed to upload book' })
  }
})

/**
 * Collisions never reuse a timestamp: append ` (2)`, ` (3)`, … before the
 * extension so the parsed title stays clean and nothing is overwritten.
 */
function uniqueDestPath(dir: string, baseName: string, ext: string): string {
  let candidate = join(dir, baseName + ext)
  let counter = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${baseName} (${counter})${ext}`)
    counter += 1
  }
  return candidate
}
