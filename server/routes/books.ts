import { Router } from 'express'
import multer from 'multer'
import { join, extname, basename, resolve, relative, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  SAFE_FILENAME_PATTERN,
} from '../config.js'
import { searchBookIndex, getBookIndex } from '../db.js'
import { scanAndIndex, ensureBooksDir } from '../scanner.js'

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
bookFileRouter.get('*', (req: Request, res: Response) => {
  try {
    const path = req.path.replace(/^\//, '')
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

// Upload
const upload = multer({
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase()
    if (ALLOWED_EXTENSIONS_SET.has(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported file type'))
    }
  },
})

booksRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing file' })
      return
    }

    const booksDir = await ensureBooksDir()
    const importedDir = join(booksDir, 'Imported')
    await mkdir(importedDir, { recursive: true })

    const originalName = req.file.originalname
    const ext = extname(originalName).toLowerCase()
    const safeName = basename(originalName)
      .normalize('NFKC')
      .replace(SAFE_FILENAME_PATTERN, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, -ext.length)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const finalName = safeName + ` (${timestamp})` + ext
    const destPath = join(importedDir, finalName)

    await pipeline(Readable.from(req.file.buffer), createWriteStream(destPath))

    res.json({ ok: true, id: join('Imported', finalName) })
  } catch (e) {
    console.error('Failed to upload book:', e)
    res.status(500).json({ error: 'Failed to upload book' })
  }
})
