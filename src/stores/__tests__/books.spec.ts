/**
 * Books store tests — covers RefreshLibrary, UploadBook, SearchBooks
 * and client-side sorting.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { Effect } from 'effect'

import { HttpError } from '@/services/http-client'
import type { Book } from '@/types'

// BookApi.list is a module-level Effect value, so it needs a mutable holder.
const holders = vi.hoisted(() => ({
  listEffect: undefined as unknown,
}))

vi.mock('@/services/api', () => ({
  BookApi: {
    get list() {
      return holders.listEffect
    },
    search: vi.fn<typeof BookApi.search>(),
    getById: vi.fn<typeof BookApi.getById>(),
    getContentUrl: vi.fn<typeof BookApi.getContentUrl>(),
    upload: vi.fn<typeof BookApi.upload>(),
  },
}))

import { BookApi } from '@/services/api'
import { useBooksStore } from '@/stores/books'

const uploadMock = vi.mocked(BookApi.upload)

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'Author - Title.epub',
    title: 'Title',
    author: 'Author',
    path: 'Author - Title.epub',
    format: 'epub',
    size: 1000,
    mtime: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const library: Book[] = [
  book({ id: 'b1', title: 'Zebra', author: 'Alice', size: 300, mtime: '2024-03-01T00:00:00.000Z' }),
  book({ id: 'b2', title: 'Apple', author: 'Zoe', size: 100, mtime: '2024-01-01T00:00:00.000Z' }),
  book({ id: 'b3', title: 'Mango', author: 'Bob', size: 200, mtime: '2024-02-01T00:00:00.000Z' }),
]

describe('useBooksStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    holders.listEffect = Effect.succeed(library)
    uploadMock.mockReturnValue(Effect.succeed({ ok: true, id: 'Imported/New.epub' }))
  })

  describe('fetchBooks', () => {
    it('populates the library', async () => {
      const store = useBooksStore()

      await store.fetchBooks()

      expect(store.books).toHaveLength(3)
      expect(store.bookCount).toBe(3)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('records the error and falls back to an empty library', async () => {
      holders.listEffect = Effect.fail(new HttpError(500, 'scan failed'))
      const store = useBooksStore()

      await store.fetchBooks()

      expect(store.books).toEqual([])
      expect(store.error).toBe('scan failed')
      expect(store.loading).toBe(false)
    })
  })

  describe('search', () => {
    it('matches titles case-insensitively', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      store.setSearch('APP')
      expect(store.filteredBooks.map((b) => b.title)).toEqual(['Apple'])
    })

    it('matches authors as well as titles', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      store.setSearch('bob')
      expect(store.filteredBooks.map((b) => b.title)).toEqual(['Mango'])
    })

    it('returns everything for an empty query', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      store.setSearch('')
      expect(store.filteredBooks).toHaveLength(3)
    })
  })

  describe('sorting', () => {
    it('sorts by title ascending by default', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      expect(store.filteredBooks.map((b) => b.title)).toEqual(['Apple', 'Mango', 'Zebra'])
    })

    it('sorts by author', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      store.setSort('author')
      expect(store.filteredBooks.map((b) => b.author)).toEqual(['Alice', 'Bob', 'Zoe'])
    })

    it('defaults size and mtime to descending', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      store.setSort('size')
      expect(store.order).toBe('desc')
      expect(store.filteredBooks.map((b) => b.size)).toEqual([300, 200, 100])

      store.setSort('mtime')
      expect(store.order).toBe('desc')
      expect(store.filteredBooks.map((b) => b.mtime)).toEqual([
        '2024-03-01T00:00:00.000Z',
        '2024-02-01T00:00:00.000Z',
        '2024-01-01T00:00:00.000Z',
      ])
    })

    it('toggles order when sorting by the same field twice', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      store.setSort('title')
      expect(store.order).toBe('desc')
      expect(store.filteredBooks.map((b) => b.title)).toEqual(['Zebra', 'Mango', 'Apple'])

      store.setSort('title')
      expect(store.order).toBe('asc')
      expect(store.filteredBooks.map((b) => b.title)).toEqual(['Apple', 'Mango', 'Zebra'])
    })

    it('setOrder and toggleOrder work independently', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      store.setOrder('desc')
      expect(store.filteredBooks.map((b) => b.title)).toEqual(['Zebra', 'Mango', 'Apple'])

      store.toggleOrder()
      expect(store.order).toBe('asc')
    })
  })

  describe('uploadBook', () => {
    it('refetches the library after a successful upload', async () => {
      const store = useBooksStore()
      const file = new File(['x'], 'New.epub', { type: 'application/epub+zip' })

      await store.uploadBook(file)

      expect(uploadMock).toHaveBeenCalledWith(file)
      // The library is fetched again so the uploaded book shows up
      expect(store.books).toHaveLength(3)
      expect(store.error).toBeNull()
    })

    it('records the error and throws a plain Error on failure', async () => {
      uploadMock.mockReturnValue(Effect.fail(new HttpError(413, 'File too large')))
      const store = useBooksStore()

      await expect(store.uploadBook(new File(['x'], 'Big.epub'))).rejects.toThrow('File too large')
      expect(store.error).toBe('File too large')
    })
  })
})
