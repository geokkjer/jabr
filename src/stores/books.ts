import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Effect, pipe } from 'effect'
import { BookApi } from '@/services/api'
import type { UploadResult } from '@/services/api'
import type { Book } from '@/types'

export const useBooksStore = defineStore('books', () => {
  // ── State ──
  const books = ref<Book[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const search = ref('')
  const sort = ref<'title' | 'author' | 'size' | 'mtime'>('title')
  const order = ref<'asc' | 'desc'>('asc')

  // ── Getters ──
  const filteredBooks = computed<Book[]>(() => {
    let result = [...books.value]

    if (search.value) {
      const q = search.value.toLowerCase()
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
      )
    }

    result.sort((a, b) => {
      let cmp = 0
      switch (sort.value) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'author':
          cmp = a.author.localeCompare(b.author)
          break
        case 'size':
          cmp = a.size - b.size
          break
        case 'mtime':
          cmp = new Date(a.mtime).getTime() - new Date(b.mtime).getTime()
          break
      }
      return order.value === 'asc' ? cmp : -cmp
    })

    return result
  })

  const bookCount = computed(() => books.value.length)

  // ── Actions ──
  async function fetchBooks() {
    loading.value = true
    error.value = null

    const result = await Effect.runPromise(
      pipe(
        BookApi.list,
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.succeed([] as unknown as Book[])
        }),
      ),
    )
    books.value = result as Book[]
    loading.value = false
  }

  function setSearch(q: string) {
    search.value = q
  }

  function setSort(field: typeof sort.value) {
    if (sort.value === field) {
      toggleOrder()
    } else {
      sort.value = field
      order.value = field === 'size' || field === 'mtime' ? 'desc' : 'asc'
    }
  }

  function setOrder(o: typeof order.value) {
    order.value = o
  }

  function toggleOrder() {
    order.value = order.value === 'asc' ? 'desc' : 'asc'
  }

  /**
   * Import one or more files (or a folder selection). Resolves with the
   * per-file summary; throws a plain Error on failure so callers can show
   * `err.message` directly.
   */
  async function uploadBook(files: File[]): Promise<UploadResult> {
    return Effect.runPromise(
      pipe(
        BookApi.upload(files),
        Effect.flatMap((result) =>
          // Refetch after a successful import so the new books appear
          pipe(
            Effect.promise(() => fetchBooks()),
            Effect.as(result),
          ),
        ),
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.fail(new Error(err.message))
        }),
      ),
    )
  }

  return {
    // state
    books,
    loading,
    error,
    search,
    sort,
    order,
    // getters
    filteredBooks,
    bookCount,
    // actions
    fetchBooks,
    setSearch,
    setSort,
    setOrder,
    toggleOrder,
    uploadBook,
  }
})
