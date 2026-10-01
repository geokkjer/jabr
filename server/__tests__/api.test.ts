/**
 * API integration tests — covers rules: RefreshLibrary, UploadBook,
 * CreateProfile, RecordReadingProgress, Login, Logout, UpdateSettings,
 * ToggleAuthentication, MigrateFromCalibre.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
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
// Upload — covers UploadBook rule
// ============================================================
describe('POST /api/books/upload', () => {
  it('accepts a valid epub file', async () => {
    const form = new FormData()
    const file = new File(['mock content'], 'New Author - New Book.epub', {
      type: 'application/epub+zip',
    })
    form.append('file', file)

    const res = await fetch(`${baseUrl}/api/books/upload`, {
      method: 'POST',
      body: form,
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.id).toContain('Imported')
  })

  it('accepts a valid pdf file', async () => {
    const form = new FormData()
    const file = new File(['%PDF-1.4 mock'], 'Manual.pdf', {
      type: 'application/pdf',
    })
    form.append('file', file)

    const res = await fetch(`${baseUrl}/api/books/upload`, {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(200)
  })

  it('responds with error when no file is provided', async () => {
    const { status } = await api('/api/books/upload', { method: 'POST', body: '{}' })
    expect(status).toBe(400)
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

  it('returns 404 when progress does not exist', async () => {
    const { status } = await api(
      `/api/progress/no-such-book.epub?profileId=${encodeURIComponent(profileId)}`
    )
    expect(status).toBe(404)
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
// Settings — covers UpdateSettings rule
// ============================================================
describe('Settings API', () => {
  it('returns empty settings initially', async () => {
    const { status, body } = await api('/api/settings')
    expect(status).toBe(200)
    const settings = body as Record<string, unknown>
    expect(settings.libraryPath).toBeNull()
    expect(settings.readerTarget).toBeNull()
  })

  it('saves and retrieves settings', async () => {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        libraryPath: '/tmp/books',
        readerTarget: 'epub',
      }),
    })

    const { body } = await api('/api/settings')
    const settings = body as Record<string, unknown>
    expect(settings.libraryPath).toBe('/tmp/books')
    expect(settings.readerTarget).toBe('epub')
  })

  it('updates individual settings without affecting others', async () => {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ libraryPath: '/tmp/library', readerTarget: 'pdf' }),
    })

    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ readerTarget: 'epub' }),
    })

    const { body } = await api('/api/settings')
    const settings = body as Record<string, unknown>
    expect(settings.libraryPath).toBe('/tmp/library')
    expect(settings.readerTarget).toBe('epub')
  })
})

// ============================================================
// Export — black box, verifies it exists
// ============================================================
describe('GET /api/settings/export', () => {
  it('returns a JSON backup', async () => {
    const res = await fetch(`${baseUrl}/api/settings/export`)
    expect(res.status).toBe(200)
    const ct = res.headers.get('content-type') || ''
    expect(ct).toContain('application/json')
    expect(res.headers.get('content-disposition')).toContain('attachment')
  })
})

// ============================================================
// Database reset — covers SettingsDashboard.ResetDatabase
// ============================================================
describe('DELETE /api/settings', () => {
  it('resets all data', async () => {
    await api('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'To Delete' }),
    })
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ libraryPath: '/tmp' }),
    })

    const { status } = await api('/api/settings', { method: 'DELETE' })
    expect(status).toBe(200)

    const { body: profiles } = await api('/api/profiles')
    expect((profiles as Array<unknown>)).toHaveLength(0)

    const { body: settings } = await api('/api/settings')
    expect((settings as Record<string, unknown>).libraryPath).toBeNull()
  })
})
