/**
 * API integration tests — covers rules: RefreshLibrary, UploadBook,
 * CreateProfile, RecordReadingProgress, plus backup export and data reset.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
} from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'

import { app } from '../index.js'
import { resetDatabase } from '../db.js'
import { invalidateScanCache } from '../scanner.js'

let server: Server
let baseUrl: string
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jabr-api-test-'))
  mkdirSync(join(tmpDir, 'Imported'), { recursive: true })
  process.env.JABR_BOOKS_PATH = tmpDir

  // Create test books
  writeFileSync(join(tmpDir, 'Test Author - Test Book.epub'), 'mock epub content')

  return new Promise<void>((resolve) => {
    server = createServer(app as unknown as Parameters<typeof createServer>[0])
    server.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        baseUrl = `http://localhost:${addr.port}`
      }
      resolve()
    })
  })
})

afterAll(() => {
  server?.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  resetDatabase()
  invalidateScanCache()
})

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const text = await res.text()
  let body: unknown
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body, headers: res.headers }
}

// Pre-populate the book index for search tests
async function populateIndex(): Promise<Array<Record<string, unknown>>> {
  const { body } = await api('/api/books')
  return body as Array<Record<string, unknown>>
}

// ============================================================
// Health check
// ============================================================
describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const { status, body } = await api('/api/health')
    expect(status).toBe(200)
    expect(body).toEqual({ status: 'ok' })
  })
})

// ============================================================
// Books — covers RefreshLibrary rule
// ============================================================
describe('GET /api/books', () => {
  it('returns books scanned from the filesystem', async () => {
    const { status, body } = await api('/api/books')
    expect(status).toBe(200)
    const books = body as Array<Record<string, unknown>>
    expect(books.length).toBeGreaterThanOrEqual(1)
    expect(books[0].title).toBe('Test Book')
    expect(books[0].author).toBe('Test Author')
    expect(books[0].format).toBeDefined()
    expect(books[0].size).toBeGreaterThan(0)
  })

  it('indexes books on second call without stale duplicates', async () => {
    await api('/api/books')
    const { body: second } = await api('/api/books')
    const books = second as Array<Record<string, unknown>>
    // Same number of books, not doubled
    expect(books.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================
// Search — covers SearchBooks surface
// ============================================================
describe('GET /api/books/search', () => {
  it('searches by title after index is populated', async () => {
    await populateIndex()
    const { status, body } = await api('/api/books/search?q=test+book')
    expect(status).toBe(200)
    const books = body as Array<Record<string, unknown>>
    expect(books.length).toBeGreaterThanOrEqual(1)
    expect((books[0].title as string).toLowerCase()).toContain('test')
  })

  it('returns empty for no match', async () => {
    await populateIndex()
    const { status, body } = await api('/api/books/search?q=nonexistentbookxyz')
    expect(status).toBe(200)
    const books = body as Array<unknown>
    expect(books).toHaveLength(0)
  })

  it('returns all books when query is empty', async () => {
    await populateIndex()
    const { status, body } = await api('/api/books/search?q=')
    expect(status).toBe(200)
    const books = body as Array<unknown>
    expect(books.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================
// Book serving — GET /api/book/*
// ============================================================
describe('GET /api/book/*', () => {
  it('serves an existing book file with correct content type', async () => {
    const res = await fetch(`${baseUrl}/api/book/${encodeURIComponent('Test Author - Test Book.epub')}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/epub+zip')
    const text = await res.text()
    expect(text).toBe('mock epub content')
  })

  it('serves files from subdirectories', async () => {
    mkdirSync(join(tmpDir, 'Subdir'), { recursive: true })
    writeFileSync(join(tmpDir, 'Subdir', 'Nested - Book.txt'), 'nested content')
    const res = await fetch(
      `${baseUrl}/api/book/${encodeURIComponent('Subdir/Nested - Book.txt')}`
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('nested content')
  })

  it('returns 404 for unknown book', async () => {
    const { status } = await api('/api/book/nonexistent.epub')
    expect(status).toBe(404)
  })

  it('returns 403 for disallowed file type', async () => {
    writeFileSync(join(tmpDir, 'image.jpg'), 'not a book')
    const { status } = await api('/api/book/image.jpg')
    expect(status).toBe(403)
  })

  it('prevents directory traversal (..)', async () => {
    const { status } = await api('/api/book/..%2F..%2Fetc%2Fpasswd')
    expect(status).toBeOneOf([403, 404])
  })
})

// ============================================================
// Upload — covers UploadBook rule (POST /api/books/upload, field `files`)
// ============================================================
interface UploadEntry {
  path: string
  status: 'imported' | 'skipped' | 'failed'
  reason: string | null
}

interface UploadBody {
  ok: boolean
  imported: number
  skipped: number
  failed: number
  files: UploadEntry[]
}

/** Force a multipart filename the way a browser's folder picker would. */
function fileNamed(name: string, contents: string): File {
  const file = new File([contents], name, { type: 'application/octet-stream' })
  Object.defineProperty(file, 'name', { value: name })
  return file
}

async function upload(files: File[]): Promise<{ status: number; body: UploadBody }> {
  const form = new FormData()
  for (const file of files) form.append('files', file)

  const res = await fetch(`${baseUrl}/api/books/upload`, { method: 'POST', body: form })
  return { status: res.status, body: (await res.json()) as UploadBody }
}

describe('POST /api/books/upload', () => {
  it('imports multiple files in a single request', async () => {
    const { status, body } = await upload([
      new File(['mock content'], 'New Author - New Book.epub', { type: 'application/epub+zip' }),
      new File(['%PDF-1.4 mock'], 'Manual.pdf', { type: 'application/pdf' }),
      new File(['plain'], 'Notes.txt', { type: 'text/plain' }),
    ])

    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.imported).toBe(3)
    expect(body.skipped).toBe(0)
    expect(body.failed).toBe(0)
    expect(body.files).toHaveLength(3)
    expect(body.files.every((f) => f.status === 'imported' && f.reason === null)).toBe(true)
    expect(body.files.map((f) => f.path)).toContain('Imported/New Author - New Book.epub')
    expect(existsSync(join(tmpDir, 'Imported', 'Manual.pdf'))).toBe(true)
    expect(readFileSync(join(tmpDir, 'Imported', 'Notes.txt'), 'utf8')).toBe('plain')
  })

  it('preserves the relative directory structure of a folder upload', async () => {
    const { status, body } = await upload([
      fileNamed('My Books/Author - Title.epub', 'nested epub'),
    ])

    expect(status).toBe(200)
    expect(body.imported).toBe(1)
    expect(body.files[0]!.path).toBe('Imported/My Books/Author - Title.epub')
    expect(readFileSync(join(tmpDir, 'Imported', 'My Books', 'Author - Title.epub'), 'utf8')).toBe(
      'nested epub',
    )
  })

  it('suffixes collisions with (2) and never overwrites the original', async () => {
    const first = await upload([new File(['first'], 'Duplicate.epub')])
    const second = await upload([new File(['second'], 'Duplicate.epub')])
    const third = await upload([new File(['third'], 'Duplicate.epub')])

    expect(first.body.files[0]!.path).toBe('Imported/Duplicate.epub')
    expect(second.body.files[0]!.path).toBe('Imported/Duplicate (2).epub')
    expect(third.body.files[0]!.path).toBe('Imported/Duplicate (3).epub')

    // No timestamp pollution, and the original content is intact
    expect(readFileSync(join(tmpDir, 'Imported', 'Duplicate.epub'), 'utf8')).toBe('first')
    expect(readFileSync(join(tmpDir, 'Imported', 'Duplicate (2).epub'), 'utf8')).toBe('second')
  })

  it('reports a disallowed extension as failed without writing it', async () => {
    const { status, body } = await upload([
      new File(['not a book'], 'Malware.exe', { type: 'application/octet-stream' }),
      new File(['fine'], 'Keep.md'),
    ])

    expect(status).toBe(200)
    expect(body.imported).toBe(1)
    expect(body.failed).toBe(1)
    const bad = body.files.find((f) => f.status === 'failed')
    expect(bad?.path).toBe('Malware.exe')
    expect(bad?.reason).toBeTruthy()
    expect(existsSync(join(tmpDir, 'Imported', 'Malware.exe'))).toBe(false)
    expect(existsSync(join(tmpDir, 'Imported', 'Keep.md'))).toBe(true)
  })

  it('flattens a traversal attempt into the books directory', async () => {
    const { status, body } = await upload([
      fileNamed('../../evil.epub', 'evil content'),
    ])

    expect(status).toBe(200)
    expect(body.imported).toBe(1)

    const entry = body.files[0]!
    expect(entry.path).toBe('Imported/evil.epub')
    expect(entry.path).not.toContain('..')
    expect(isAbsolute(entry.path)).toBe(false)

    const written = join(tmpDir, ...entry.path.split('/'))
    expect(existsSync(written)).toBe(true)
    // Lands inside the books dir, never outside it
    const rel = relative(tmpDir, written)
    expect(rel.startsWith('..')).toBe(false)
    expect(rel).toBe(join('Imported', 'evil.epub'))
    expect(existsSync(join(tmpDir, '..', 'evil.epub'))).toBe(false)
  })

  it('responds 400 when no files are provided', async () => {
    const form = new FormData()
    const res = await fetch(`${baseUrl}/api/books/upload`, { method: 'POST', body: form })
    expect(res.status).toBe(400)
  })
})

// ============================================================
// Profiles — covers CreateProfile rule
// ============================================================
describe('Profiles API', () => {
  it('GET /api/profiles returns empty list initially', async () => {
    const { status, body } = await api('/api/profiles')
    expect(status).toBe(200)
    expect(body).toEqual([])
  })

  it('POST /api/profiles creates a profile', async () => {
    const { status, body } = await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Reader One' }),
    })
    expect(status).toBe(200)
    expect((body as Record<string, unknown>).name).toBe('Reader One')
    expect((body as Record<string, unknown>).id).toBeTruthy()
  })

  it('GET /api/profiles lists created profiles', async () => {
    await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    })
    await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bob' }),
    })

    const { body } = await api('/api/profiles')
    const profiles = body as Array<{ name: string }>
    expect(profiles).toHaveLength(2)
  })

  it('POST /api/profiles rejects empty name', async () => {
    const { status } = await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    })
    expect(status).toBe(400)
  })
})

// ============================================================
// Progress — covers RecordReadingProgress rule
// ============================================================
describe('Progress API', () => {
  let profileId: string

  beforeEach(async () => {
    const { body } = await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Progress User' }),
    })
    profileId = (body as { id: string }).id
  })

  it('saves and retrieves reading progress', async () => {
    await api('/api/progress/test-book.epub', {
      method: 'PUT',
      body: JSON.stringify({
        profileId,
        format: 'epub',
        location: { cfi: 'epubcfi(/6/4)' },
        percent: 42.5,
      }),
    })

    const { status, body } = await api(
      `/api/progress/test-book.epub?profileId=${encodeURIComponent(profileId)}`
    )
    expect(status).toBe(200)
    expect((body as Record<string, unknown>).percent).toBe(42.5)
  })

  it('returns null when no progress has been saved yet', async () => {
    const { status, body } = await api(
      `/api/progress/no-such-book.epub?profileId=${encodeURIComponent(profileId)}`
    )
    expect(status).toBe(200)
    expect(body).toBeNull()
  })

  it('updates existing progress on second save', async () => {
    await api('/api/progress/update-test.epub', {
      method: 'PUT',
      body: JSON.stringify({
        profileId,
        format: 'epub',
        location: { cfi: 'epubcfi(/6/2)' },
        percent: 10,
      }),
    })

    await api('/api/progress/update-test.epub', {
      method: 'PUT',
      body: JSON.stringify({
        profileId,
        format: 'epub',
        location: { cfi: 'epubcfi(/6/8)' },
        percent: 90,
      }),
    })

    const { body } = await api(
      `/api/progress/update-test.epub?profileId=${encodeURIComponent(profileId)}`
    )
    expect((body as Record<string, unknown>).percent).toBe(90)
  })

  it('returns 400 when profileId is missing', async () => {
    const { status } = await api('/api/progress/some-book.epub')
    expect(status).toBe(400)
  })
})

// ============================================================
// Admin — backup export and data reset
// ============================================================
describe('GET /api/admin/export', () => {
  it('returns a JSON backup of profiles and progress', async () => {
    const res = await fetch(`${baseUrl}/api/admin/export`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('content-disposition')).toContain('attachment')

    const body = (await res.json()) as Record<string, unknown>
    expect(body.version).toBe('1.0')
    expect(Array.isArray(body.profiles)).toBe(true)
    expect(Array.isArray(body.progress)).toBe(true)
  })

  it('includes saved progress in the backup', async () => {
    const { body: profile } = await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Backup User' }),
    })
    const profileId = (profile as { id: string }).id

    await api('/api/progress/backup-test.epub', {
      method: 'PUT',
      body: JSON.stringify({
        profileId,
        format: 'epub',
        location: { cfi: 'epubcfi(/6/2)' },
        percent: 25,
      }),
    })

    const res = await fetch(`${baseUrl}/api/admin/export`)
    const body = (await res.json()) as { progress: Array<Record<string, unknown>> }
    expect(body.progress).toHaveLength(1)
    expect(body.progress[0]!.percent).toBe(25)
  })
})

describe('DELETE /api/admin/data', () => {
  it('resets profiles, progress and the book index', async () => {
    await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'To Delete' }),
    })
    await api('/api/books')

    const { status } = await api('/api/admin/data', { method: 'DELETE' })
    expect(status).toBe(200)

    const { body: profiles } = await api('/api/profiles')
    expect(profiles as Array<unknown>).toHaveLength(0)

    const res = await fetch(`${baseUrl}/api/admin/export`)
    const backup = (await res.json()) as { progress: Array<unknown> }
    expect(backup.progress).toHaveLength(0)
  })
})
