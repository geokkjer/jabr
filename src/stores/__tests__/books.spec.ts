/**
 * Books store tests — covers RefreshLibrary, UploadBook, SearchBooks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Book } from '@/types'

// Singleton mock API objects
const mockBooksApi = {
  list: vi.fn(),
  search: vi.fn(),
  getById: vi.fn(),
  getContentUrl: vi.fn(() => '/api/book/test'),
  upload: vi.fn(),
}

vi.mock('@/composables/useApi', () => ({
  useBooksApi: () => mockBooksApi,
  useProfilesApi: () => ({
    list: vi.fn(),
    create: vi.fn(),
  }),
  useProgressApi: () => ({
    get: vi.fn(),
    save: vi.fn(),
  }),
  useSettingsApi: () => ({
    get: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
  }),
  useAuthApi: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    status: vi.fn(),
  }),
}))

import { useBooksStore } from '../books'

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'test-book.epub',
    title: 'Test Book',
    author: 'Test Author',
    path: 'test-book.epub',
    format: 'epub',
    size: 12345,
    mtime: new Date('2024-01-01'),
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

// ============================================================
// Fetch Books — covers RefreshLibrary rule
// ============================================================
describe('fetchBooks', () => {
  it('loads books from the API', async () => {
    mockBooksApi.list.mockResolvedValue([
      makeBook({ id: 'a.epub', title: 'Book A' }),
      makeBook({ id: 'b.pdf', title: 'Book B', format: 'pdf' }),
    ])

    const store = useBooksStore()
    await store.fetchBooks()

    expect(store.books).toHaveLength(2)
    expect(store.bookCount).toBe(2)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('handles fetch error', async () => {
    mockBooksApi.list.mockRejectedValue(new Error('Network error'))

    const store = useBooksStore()
    await store.fetchBooks()

    expect(store.error).toBe('Network error')
    expect(store.books).toHaveLength(0)
  })
})

// ============================================================
// Search & Filter — covers SearchBooks surface
// ============================================================
describe('search and filter', () => {
  async function seedBooks(store: ReturnType<typeof useBooksStore>) {
    mockBooksApi.list.mockResolvedValue([
      makeBook({ id: 'a.epub', title: 'Learning Rust', author: 'John Doe' }),
      makeBook({ id: 'b.pdf', title: 'Python Guide', author: 'Jane Smith', format: 'pdf', size: 9999 }),
      makeBook({ id: 'c.epub', title: 'Advanced Rust', author: 'Alice Brown' }),
    ])
    await store.fetchBooks()
    // After fetch, we need fresh mock setup since fetchBooks consumes the list mock
  }

  it('filters books by search query (case-insensitive)', async () => {
    const store = useBooksStore()
    await seedBooks(store)
    store.setSearch('rust')
    expect(store.filteredBooks).toHaveLength(2)
    expect(store.filteredBooks.map((b) => b.title)).toContain('Learning Rust')
    expect(store.filteredBooks.map((b) => b.title)).toContain('Advanced Rust')
  })

  it('searches by author', async () => {
    const store = useBooksStore()
    await seedBooks(store)
    store.setSearch('jane')
    expect(store.filteredBooks).toHaveLength(1)
    expect(store.filteredBooks[0].author).toBe('Jane Smith')
  })

  it('returns empty when no books match search', async () => {
    const store = useBooksStore()
    await seedBooks(store)
    store.setSearch('nonexistent')
    expect(store.filteredBooks).toHaveLength(0)
  })

  it('sorts by title ascending', async () => {
    const store = useBooksStore()
    await seedBooks(store)
    store.setSort('title')
    store.setOrder('asc')
    const titles = store.filteredBooks.map((b) => b.title)
    expect(titles).toEqual(['Advanced Rust', 'Learning Rust', 'Python Guide'])
  })

  it('sorts by title descending', async () => {
    const store = useBooksStore()
    await seedBooks(store)
    store.setSort('title')
    store.setOrder('desc')
    const titles = store.filteredBooks.map((b) => b.title)
    expect(titles).toEqual(['Python Guide', 'Learning Rust', 'Advanced Rust'])
  })

  it('sorts by size ascending', async () => {
    const store = useBooksStore()
    await seedBooks(store)
    store.setSort('size')
    store.setOrder('asc')
    expect(store.filteredBooks[0].size).toBeLessThanOrEqual(store.filteredBooks[2].size)
  })

  it('toggles sort order when same sort field selected', async () => {
    const store = useBooksStore()
    await seedBooks(store)
    store.setSort('title')
    store.setOrder('asc')
    store.setSort('title') // toggles order
    expect(store.order).toBe('desc')
  })
})

// ============================================================
// Upload — covers UploadBook rule
// ============================================================
describe('uploadBook', () => {
  it('uploads a book and refreshes the list', async () => {
    mockBooksApi.upload.mockResolvedValue({ ok: true, id: 'Imported/New Book.epub' })
    mockBooksApi.list.mockResolvedValue([makeBook({ id: 'Imported/New Book.epub', title: 'New Book' })])

    const store = useBooksStore()
    const file = new File(['content'], 'New Author - New Book.epub', {
      type: 'application/epub+zip',
    })

    await store.uploadBook(file)

    expect(mockBooksApi.upload).toHaveBeenCalledWith(file)
    expect(store.books[0].title).toBe('New Book')
  })

  it('handles upload error and re-throws', async () => {
    mockBooksApi.upload.mockRejectedValue(new Error('File too large'))

    const store = useBooksStore()
    const file = new File(['content'], 'large.epub', { type: 'application/epub+zip' })

    await expect(store.uploadBook(file)).rejects.toThrow('File too large')
    expect(store.error).toBe('File too large')
  })
})

// ============================================================
// Book entity integrity
// ============================================================
describe('book entities', () => {
  it('each book has required fields', async () => {
    mockBooksApi.list.mockResolvedValue([
      makeBook({ id: 'verify.epub', format: 'epub' }),
    ])

    const store = useBooksStore()
    await store.fetchBooks()

    const book = store.books[0]
    expect(book.id).toBeTruthy()
    expect(book.title).toBeTruthy()
    expect(book.author).toBeTruthy()
    expect(book.format).toBeTruthy()
    expect(book.size).toBeGreaterThan(0)
    expect(book.mtime).toBeInstanceOf(Date)
  })
})
