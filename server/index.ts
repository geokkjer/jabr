import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { join, extname, basename, resolve, relative, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream, existsSync, statSync, createReadStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Request, Response } from 'express'

import {
  PORT,
  NODE_ENV,
  getBooksDir,
  UPLOAD_MAX_BYTES,
  ALLOWED_EXTENSIONS_SET,
  CONTENT_TYPES,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
} from './config.js'
import {
  getDb,
  getSetting,
  setSetting,
  listProfiles,
  getProfile,
  createProfile,
  listRecentProgress,
  getBookProgress,
  upsertBookProgress,
  listBookIndex,
  searchBookIndex,
  getBookIndex,
  resetDatabase,
} from './db.js'
import { scanAndIndex, ensureBooksDir } from './scanner.js'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Ensure DB is initialized
getDb()

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

// Books
app.get('/api/books', async (_req: Request, res: Response) => {
  try {
    const books = await scanAndIndex()
    res.json(books)
  } catch (e) {
    console.error('Failed to scan books:', e)
    res.status(500).json({ error: 'Failed to scan books' })
  }
})

app.get('/api/books/search', async (req: Request, res: Response) => {
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

// Serve book file
app.use('/api/book', (req: Request, res: Response) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const path = req.path.replace(/^\/api\/book\//, '')
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

    const ext = extname(filePath).toLowerCase() as '.pdf' | '.epub' | '.txt' | '.md'
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
    const ext = extname(file.originalname).toLowerCase() as '.pdf' | '.epub' | '.txt' | '.md'
    if (ALLOWED_EXTENSIONS_SET.has(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported file type'))
    }
  },
})

app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
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
      .replace(/[^a-zA-Z0-9._ -]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const finalName = safeName.replace(ext, '') + ` (${timestamp})` + ext
    const destPath = join(importedDir, finalName)

    await pipeline(Readable.from(req.file.buffer), createWriteStream(destPath))

    res.json({ ok: true, id: join('Imported', finalName) })
  } catch (e) {
    console.error('Failed to upload book:', e)
    res.status(500).json({ error: 'Failed to upload book' })
  }
})

// Profiles
app.get('/api/profiles', (_req: Request, res: Response) => {
  try {
    res.json(listProfiles())
  } catch (e) {
    console.error('Failed to list profiles:', e)
    res.status(500).json({ error: 'Failed to list profiles' })
  }
})

app.post('/api/profiles', (req: Request, res: Response) => {
  try {
    const { name } = req.body
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Missing name' })
      return
    }
    const profile = createProfile(name.trim())
    res.json(profile)
  } catch (e) {
    console.error('Failed to create profile:', e)
    res.status(500).json({ error: 'Failed to create profile' })
  }
})

// Progress
app.get('/api/progress/:bookId', (req: Request, res: Response) => {
  try {
    const bookId = req.params.bookId as string
    const profileId = req.query.profileId as string
    if (!profileId) {
      res.status(400).json({ error: 'Missing profileId' })
      return
    }
    const progress = getBookProgress(profileId, bookId)
    if (!progress) {
      res.status(404).json({ error: 'Progress not found' })
      return
    }
    res.json(progress)
  } catch (e) {
    console.error('Failed to get progress:', e)
    res.status(500).json({ error: 'Failed to get progress' })
  }
})

app.put('/api/progress/:bookId', (req: Request, res: Response) => {
  try {
    const bookId = req.params.bookId as string
    const { profileId, format, location, percent } = req.body
    if (!profileId) {
      res.status(400).json({ error: 'Missing profileId' })
      return
    }
    upsertBookProgress({
      profileId,
      bookId,
      format: format || 'unknown',
      locationJson: JSON.stringify(location || null),
      percent: percent ?? null,
    })
    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to save progress:', e)
    res.status(500).json({ error: 'Failed to save progress' })
  }
})

// Settings
app.get('/api/settings', (_req: Request, res: Response) => {
  try {
    const keys = ['libraryPath', 'authEnabled', 'username', 'password', 'readerTarget']
    const settings: Record<string, string | null> = {}
    for (const key of keys) {
      settings[key] = getSetting(key)
    }
    res.json(settings)
  } catch (e) {
    console.error('Failed to get settings:', e)
    res.status(500).json({ error: 'Failed to get settings' })
  }
})

app.post('/api/settings', (req: Request, res: Response) => {
  try {
    const settings = req.body
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined && value !== null) {
        setSetting(key, String(value))
      }
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to save settings:', e)
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

app.delete('/api/settings', (_req: Request, res: Response) => {
  try {
    resetDatabase()
    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to reset database:', e)
    res.status(500).json({ error: 'Failed to reset database' })
  }
})

// Auth
app.post('/api/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body
    const authEnabled = getSetting('authEnabled') === 'true'

    if (!authEnabled) {
      res.json({ ok: true })
      return
    }

    const expectedUser = getSetting('username') || 'admin'
    const storedPassword = getSetting('password')

    if (username !== expectedUser) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    if (!storedPassword) {
      if (password === 'admin') {
        res.cookie(AUTH_COOKIE_NAME, 'authenticated', {
          maxAge: AUTH_COOKIE_MAX_AGE * 1000,
          httpOnly: true,
          sameSite: 'strict',
        })
        res.json({ ok: true })
        return
      }
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // Simple plain text password comparison for now (client-side auth)
    if (password === storedPassword) {
      res.cookie(AUTH_COOKIE_NAME, 'authenticated', {
        maxAge: AUTH_COOKIE_MAX_AGE * 1000,
        httpOnly: true,
        sameSite: 'strict',
      })
      res.json({ ok: true })
      return
    }

    res.status(401).json({ error: 'Invalid credentials' })
  } catch (e) {
    console.error('Failed to login:', e)
    res.status(500).json({ error: 'Failed to login' })
  }
})

app.delete('/api/login', (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME)
  res.json({ ok: true })
})

app.get('/api/login/status', (_req: Request, res: Response) => {
  const authEnabled = getSetting('authEnabled') === 'true'
  res.json({ authEnabled })
})

// Export
app.get('/api/export', async (_req: Request, res: Response) => {
  try {
    const profiles = listProfiles()
    const progress = listRecentProgress('', 10000) // Get all
    const settings: Record<string, string | null> = {}
    const keys = ['libraryPath', 'authEnabled', 'username', 'password', 'readerTarget']
    for (const key of keys) {
      settings[key] = getSetting(key)
    }

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings,
      profiles,
      progress,
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="jabr-backup.json"')
    res.json(backup)
  } catch (e) {
    console.error('Failed to export:', e)
    res.status(500).json({ error: 'Failed to export' })
  }
})

// Serve static files in production
if (NODE_ENV === 'production') {
  const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist')
  app.use(express.static(distDir))
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(distDir, 'index.html'))
  })
}

// Start server
app.listen(PORT, () => {
  console.log(`JABR server running on port ${PORT}`)
  console.log(`Books directory: ${getBooksDir()}`)
  console.log(`Database: ${resolve(process.cwd(), 'data', 'jabr.sqlite3')}`)
})
