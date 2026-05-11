import { defineStore } from 'pinia'
import type { Book } from '@/types'
import { useBooksApi } from '@/composables/useApi'

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
          (b) =>
            b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
        )
      }

      result.sort((a, b) => {
        let cmp = 0
        if (state.sort === 'title') cmp = a.title.localeCompare(b.title)
        else if (state.sort === 'author') cmp = a.author.localeCompare(b.author)
        else if (state.sort === 'size') cmp = a.size - b.size
        else if (state.sort === 'mtime') cmp = new Date(a.mtime).getTime() - new Date(b.mtime).getTime()
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
      if (this.sort === sort) {
        this.toggleOrder()
      } else {
        this.sort = sort
        this.order = sort === 'size' || sort === 'mtime' ? 'desc' : 'asc'
      }
    },

    setOrder(order: BooksState['order']) {
      this.order = order
    },

    toggleOrder() {
      this.order = this.order === 'asc' ? 'desc' : 'asc'
    },

    async uploadBook(file: File) {
      try {
        const { upload } = useBooksApi()
        await upload(file)
        await this.fetchBooks()
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to upload book'
        throw e
      }
    },
  },
})
