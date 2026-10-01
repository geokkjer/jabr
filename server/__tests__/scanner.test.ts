/**
 * Tests for server/scanner.ts — covers RefreshLibrary rule.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { scanBooks, scanAndIndex } from '../scanner.js'
import { listBookIndex } from '../db.js'

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
    expect(books[0].author).toBe('Douglas Adams')
    expect(books[0].title).toBe("Hitchhiker's Guide")
  })

  it('uses Unknown author when no hyphen in filename', async () => {
    writeFileSync(join(tmpDir, 'justatitle.epub'), 'mock')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0].author).toBe('Unknown')
    expect(books[0].title).toBe('justatitle')
  })

  it('ignores files with unsupported extensions', async () => {
    writeFileSync(join(tmpDir, 'cover.jpg'), 'not a book')
    writeFileSync(join(tmpDir, 'metadata.xml'), 'not a book')
    writeFileSync(join(tmpDir, 'good.epub'), 'mock')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0].format).toBe('epub')
  })

  it('walks subdirectories', async () => {
    const subDir = join(tmpDir, 'subdir')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'Someone - Nested Book.pdf'), 'mock')

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('Nested Book')
  })

  it('returns book metadata including size and mtime', async () => {
    writeFileSync(join(tmpDir, 'Author - Sized.epub'), 'x'.repeat(42))

    const books = await scanBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0].size).toBe(42)
    expect(books[0].mtime).toBeInstanceOf(Date)
  })

  it('returns empty list for non-existent directory', async () => {
    const books = await scanBooks('/nonexistent/path/12345')
    expect(books).toHaveLength(0)
  })
})

describe('scanAndIndex', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jabr-index-test-'))
    writeFileSync(join(tmpDir, 'Author X - Book One.epub'), 'one')
    writeFileSync(join(tmpDir, 'Author Y - Book Two.pdf'), 'two')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('indexes books and returns them', async () => {
    const original = process.env.JABR_BOOKS_PATH
    process.env.JABR_BOOKS_PATH = tmpDir

    try {
      const books = await scanAndIndex()
      expect(books).toHaveLength(2)

      const indexed = listBookIndex()
      expect(indexed).toHaveLength(2)
      expect(indexed[0].title).toBeDefined()
      expect(indexed[0].indexedAt).toBeGreaterThan(0)
    } finally {
      process.env.JABR_BOOKS_PATH = original
    }
  })

  it('removes stale books from the index', async () => {
    const original = process.env.JABR_BOOKS_PATH
    process.env.JABR_BOOKS_PATH = tmpDir

    try {
      await scanAndIndex()
      expect(listBookIndex()).toHaveLength(2)

      rmSync(join(tmpDir, 'Author X - Book One.epub'))

      await scanAndIndex()
      const indexed = listBookIndex()
      expect(indexed).toHaveLength(1)
      expect(indexed[0].title).toBe('Book Two')
    } finally {
      process.env.JABR_BOOKS_PATH = original
    }
  })
})
