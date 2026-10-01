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
  hiddenEffect: undefined as unknown,
}))

vi.mock('@/services/api', () => ({
  BookApi: {
    get list() {
      return holders.listEffect
    },
    get listHidden() {
      return holders.hiddenEffect
    },
    search: vi.fn<typeof BookApi.search>(),
    getById: vi.fn<typeof BookApi.getById>(),
    getContentUrl: vi.fn<typeof BookApi.getContentUrl>(),
    upload: vi.fn<typeof BookApi.upload>(),
    hide: vi.fn<typeof BookApi.hide>(),
    restore: vi.fn<typeof BookApi.restore>(),
  },
}))

import { BookApi } from '@/services/api'
import type { UploadResult } from '@/services/api'
import { useBooksStore } from '@/stores/books'

const uploadMock = vi.mocked(BookApi.upload)
const hideMock = vi.mocked(BookApi.hide)
const restoreMock = vi.mocked(BookApi.restore)

const uploadResult: UploadResult = {
  ok: true,
  imported: 1,
  skipped: 1,
  failed: 0,
  files: [
    { path: 'Imported/New.epub', status: 'imported', reason: null },
    { path: 'Imported/Bad.exe', status: 'skipped', reason: 'Unsupported file type' },
  ],
}

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
    holders.hiddenEffect = Effect.succeed([])
    hideMock.mockReturnValue(Effect.succeed(undefined))
    restoreMock.mockReturnValue(Effect.succeed(undefined))
    uploadMock.mockReturnValue(Effect.succeed(uploadResult))
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
    it('refetches the library after a successful import', async () => {
      const store = useBooksStore()
      const files = [
        new File(['x'], 'New.epub', { type: 'application/epub+zip' }),
        new File(['y'], 'Notes.txt', { type: 'text/plain' }),
      ]

      const result = await store.uploadBook(files)

      expect(uploadMock).toHaveBeenCalledWith(files)
      // The library is fetched again so the imported books show up
      expect(store.books).toHaveLength(3)
      expect(store.error).toBeNull()
      expect(result).toEqual(uploadResult)
    })

    it('records the error and throws a plain Error on failure', async () => {
      uploadMock.mockReturnValue(Effect.fail(new HttpError(413, 'File too large')))
      const store = useBooksStore()

      await expect(
        store.uploadBook([new File(['x'], 'Big.epub')]),
      ).rejects.toThrow('File too large')
      expect(store.error).toBe('File too large')
    })
  })

  describe('hiding books', () => {
    it('removes the book from the library and calls the API', async () => {
      const store = useBooksStore()
      await store.fetchBooks()

      await store.hideBook('b1')

      expect(hideMock).toHaveBeenCalledWith('b1')
      expect(store.books.map((b) => b.id)).toEqual(['b2', 'b3'])
      expect(store.error).toBeNull()
    })

    it('keeps the book and reports the error when hiding fails', async () => {
      hideMock.mockReturnValue(Effect.fail(new HttpError(500, 'disk on fire')))
      const store = useBooksStore()
      await store.fetchBooks()

      await expect(store.hideBook('b1')).rejects.toThrow('disk on fire')

      expect(store.books.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
      expect(store.error).toBe('disk on fire')
    })

    it('lists hidden books for the restore view', async () => {
      holders.hiddenEffect = Effect.succeed([book({ id: 'hidden-1', title: 'Put Away' })])
      const store = useBooksStore()

      const hidden = await store.fetchHiddenBooks()

      expect(hidden.map((b) => b.id)).toEqual(['hidden-1'])
    })

    it('restores a hidden book and refetches the library', async () => {
      const store = useBooksStore()

      await store.restoreBook('hidden-1')

      expect(restoreMock).toHaveBeenCalledWith('hidden-1')
      // fetchBooks ran as part of the restore
      expect(store.books.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
    })
  })
})
