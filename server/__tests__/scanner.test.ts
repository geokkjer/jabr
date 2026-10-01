// @vitest-environment node
/**
 * Tests for server/scanner.ts — covers RefreshLibrary rule.
 *
 * Part 1: parseBookEntry (pure function)
 * Part 2: scanBooks / scanAndIndex (filesystem integration)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { parseBookEntry, scanBooks, scanAndIndex, invalidateScanCache } from '../scanner.js'
import { listBookIndex } from '../db.js'

// ============================================================
// parseBookEntry — pure filename parsing
// ============================================================
describe('parseBookEntry', () => {
  const baseDate = new Date('2024-01-01')

  it('parses Author - Title format', () => {
    const result = parseBookEntry('Tolkien - The Hobbit.epub', '.epub', 'Tolkien - The Hobbit.epub', '', 1000, baseDate)
    expect(result.title).toBe('The Hobbit')
    expect(result.author).toBe('Tolkien')
    expect(result.format).toBe('epub')
  })

  it('handles titles with hyphens', () => {
    const result = parseBookEntry('Dostoevsky - Crime and Punishment - A New Translation.epub', '.epub', 'path.epub', '', 2000, baseDate)
    expect(result.title).toBe('Crime and Punishment - A New Translation')
    expect(result.author).toBe('Dostoevsky')
  })

  it('uses parent directory as author when no dash', () => {
    const result = parseBookEntry('The Great Gatsby.pdf', '.pdf', 'Fitzgerald/The Great Gatsby.pdf', 'Fitzgerald', 3000, baseDate)
    expect(result.title).toBe('The Great Gatsby')
    expect(result.author).toBe('Fitzgerald')
  })

  it('defaults to Unknown when no author info', () => {
    const result = parseBookEntry('untitled.txt', '.txt', 'untitled.txt', '', 500, baseDate)
    expect(result.title).toBe('untitled')
    expect(result.author).toBe('Unknown')
  })

  it('sets format from extension', () => {
    const result = parseBookEntry('test.md', '.md', 'test.md', '', 100, baseDate)
    expect(result.format).toBe('md')
  })

  it('includes file stats', () => {
    const result = parseBookEntry('book.pdf', '.pdf', 'dir/book.pdf', 'dir', 999, baseDate)
    expect(result.size).toBe(999)
    expect(result.mtime).toBe(baseDate)
    expect(result.path).toBe('dir/book.pdf')
  })
})

// ============================================================
// scanBooks — filesystem integration
// ============================================================
describe('scanBooks', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jabr-scan-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('discovers epub, pdf, txt, and md files', async () => {
    writeFileSync(join(tmpDir, 'Author - A Book.epub'), 'mock epub content')
    writeFileSync(join(tmpDir, 'Author - Manual.pdf'), 'mock pdf content')
    writeFileSync(join(tmpDir, 'Author - Notes.txt'), 'mock text content')
    writeFileSync(join(tmpDir, 'Author - Readme.md'), 'mock markdown')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(4)

    const formats = books.map((b) => b.format).sort()
    expect(formats).toEqual(['epub', 'md', 'pdf', 'txt'])
  })

  it('parses Author - Title from filename', async () => {
    writeFileSync(join(tmpDir, "Douglas Adams - Hitchhiker's Guide.epub"), 'mock')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]!.author).toBe('Douglas Adams')
    expect(books[0]!.title).toBe("Hitchhiker's Guide")
  })

  it('uses parent directory as author when no hyphen in filename', async () => {
    const subDir = join(tmpDir, 'Ursula K Le Guin')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'The Dispossessed.epub'), 'mock')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]!.author).toBe('Ursula K Le Guin')
    expect(books[0]!.title).toBe('The Dispossessed')
  })

  it('ignores files with unsupported extensions', async () => {
    writeFileSync(join(tmpDir, 'cover.jpg'), 'not a book')
    writeFileSync(join(tmpDir, 'metadata.xml'), 'not a book')
    writeFileSync(join(tmpDir, 'good.epub'), 'mock')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]!.format).toBe('epub')
  })

  it('walks subdirectories', async () => {
    const subDir = join(tmpDir, 'subdir')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'Someone - Nested Book.pdf'), 'mock')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('Nested Book')
  })

  it('returns book metadata including size and mtime', async () => {
    writeFileSync(join(tmpDir, 'Author - Sized.epub'), 'x'.repeat(42))

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]!.size).toBe(42)
    expect(books[0]!.mtime).toBeInstanceOf(Date)
  })

  it('returns empty list for non-existent directory', async () => {
    const books = await scanBooks('/nonexistent/path/12345')
    expect(books).toHaveLength(0)
  })
})

// ============================================================
// scanAndIndex — DB indexing with cache invalidation
// ============================================================
describe('scanAndIndex', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jabr-index-test-'))
    writeFileSync(join(tmpDir, 'Author X - Book One.epub'), 'one')
    writeFileSync(join(tmpDir, 'Author Y - Book Two.pdf'), 'two')
    invalidateScanCache()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    invalidateScanCache()
  })

  it('indexes books and returns them', async () => {
    const original = process.env.JABR_BOOKS_PATH
    process.env.JABR_BOOKS_PATH = tmpDir

    try {
      const books = await scanAndIndex()
      expect(books).toHaveLength(2)

      const indexed = listBookIndex()
      expect(indexed).toHaveLength(2)
      expect(indexed[0]!.title).toBeDefined()
      expect(indexed[0]!.indexedAt).toBeGreaterThan(0)
    } finally {
      process.env.JABR_BOOKS_PATH = original
    }
  })

  it('serves cached results within the TTL', async () => {
    const original = process.env.JABR_BOOKS_PATH
    process.env.JABR_BOOKS_PATH = tmpDir

    try {
      await scanAndIndex()
      rmSync(join(tmpDir, 'Author X - Book One.epub'))

      // Second call within TTL returns the cached (stale) result
      const cached = await scanAndIndex()
      expect(cached).toHaveLength(2)
    } finally {
      process.env.JABR_BOOKS_PATH = original
    }
  })

  it('removes stale books from the index after cache invalidation', async () => {
    const original = process.env.JABR_BOOKS_PATH
    process.env.JABR_BOOKS_PATH = tmpDir

    try {
      await scanAndIndex()
      expect(listBookIndex()).toHaveLength(2)

      rmSync(join(tmpDir, 'Author X - Book One.epub'))
      invalidateScanCache()

      await scanAndIndex()
      const indexed = listBookIndex()
      expect(indexed).toHaveLength(1)
      expect(indexed[0]!.title).toBe('Book Two')
    } finally {
      process.env.JABR_BOOKS_PATH = original
    }
  })
})
