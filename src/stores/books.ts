import { defineStore } from 'pinia'
import type { Book } from '@/types'
import { useBooksApi } from '@/composables/useBooksApi'

interface BooksState {
  books: Book[]
  loading: boolean
  error: string | null
  search: string
  sort: 'title' | 'author' | 'size' | 'mtime'
  order: 'asc' | 'desc'
}

export const useBooksStore = defineStore('books', {
  state: (): BooksState => ({
    books: [],
    loading: false,
    error: null,
    search: '',
    sort: 'title',
    order: 'asc',
  }),

  getters: {
    filteredBooks(state): Book[] {
      let result = [...state.books]

      if (state.search) {
        const q = state.search.toLowerCase()
        result = result.filter(
          b => b.title.toLowerCase().includes(q)
            || b.author.toLowerCase().includes(q)
        )
      }

      result.sort((a, b) => {
        const aVal = String(a[state.sort] || '').toLowerCase()
        const bVal = String(b[state.sort] || '').toLowerCase()
        const cmp = aVal.localeCompare(bVal)
        return state.order === 'asc' ? cmp : -cmp
      })

      return result
    },

    bookCount(state): number {
      return state.books.length
    },
  },

  actions: {
    async fetchBooks() {
      this.loading = true
      this.error = null
      try {
        const { list } = useBooksApi()
        this.books = await list()
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to fetch books'
      } finally {
        this.loading = false
      }
    },

    setSearch(search: string) {
      this.search = search
    },

    setSort(sort: BooksState['sort']) {
      this.sort = sort
    },

    toggleOrder() {
      this.order = this.order === 'asc' ? 'desc' : 'asc'
    },
  },
})
