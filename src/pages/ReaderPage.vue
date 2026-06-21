<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Effect, pipe } from 'effect'
import { BookApi } from '@/services/api'
import { useProgressStore } from '@/stores/progress'
import { useProfilesStore } from '@/stores/profiles'
import BookReader from '@/components/BookReader.vue'
import type { Book } from '@/types'

const route = useRoute()
const router = useRouter()
const profilesStore = useProfilesStore()
const progressStore = useProgressStore()

const bookId = computed(() => decodeURIComponent(route.params.id as string))
const book = ref<Book | null>(null)
const contentUrl = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(0)

onMounted(async () => {
  const result = await Effect.runPromise(
    pipe(
      BookApi.getById(bookId.value),
      Effect.catchAll((err) => {
        error.value = err.message
        return Effect.succeed(null)
      }),
    ),
  )

  if (!result) {
    error.value = 'Book not found'
    loading.value = false
    return
  }

  book.value = result as Book
  contentUrl.value = BookApi.getContentUrl(bookId.value)

  if (profilesStore.activeId) {
    await progressStore.fetchProgress(profilesStore.activeId, bookId.value)
  }

  loading.value = false
})

function onProgress(location: Record<string, unknown>, percent: number) {
  if (profilesStore.activeId && book.value) {
    progressStore.saveProgress(profilesStore.activeId, bookId.value, {
      format: book.value.format,
      location,
      percent,
    })
  }
}

function onPageChange(page: number, total: number) {
  currentPage.value = page
  totalPages.value = total
}

function goBack() {
  router.push('/')
}
</script>

<template>
  <div
    class="h-screen flex flex-col"
    :style="{ backgroundColor: book?.format === 'epub' || book?.format === 'pdf' ? '#2b2118' : 'var(--color-parchment)' }"
  >
    <!-- Header -->
    <header class="h-16 bg-forest border-b-4 border-coffee flex items-center px-6 justify-between shrink-0 z-10 shadow-md">
      <button
        class="group flex items-center gap-2 text-parchment hover:text-ocher transition-colors"
        @click="goBack"
      >
        <span class="text-2xl font-bold">&larr;</span>
        <span class="font-display font-bold text-lg uppercase tracking-wide">Library</span>
      </button>

      <h1 class="text-xl font-display font-bold text-parchment truncate max-w-md mx-4">
        {{ book?.title || 'Loading...' }}
      </h1>

      <div class="flex items-center gap-4">
        <span
          v-if="book?.format === 'pdf' && totalPages > 0"
          class="text-parchment font-bold font-mono bg-coffee/30 px-3 py-1 rounded-lg"
        >
          Page {{ currentPage }} / {{ totalPages }}
        </span>
      </div>
    </header>

    <!-- Reader -->
    <main class="flex-1 overflow-hidden relative">
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
        <p class="text-parchment font-bold text-xl animate-pulse">Loading...</p>
      </div>

      <div v-else-if="error" class="absolute inset-0 flex items-center justify-center px-8">
        <p class="text-clay font-bold text-center">{{ error }}</p>
      </div>

      <BookReader
        v-if="contentUrl && book"
        :book-id="book.id"
        :format="book.format"
        :content-url="contentUrl"
        :initial-location="progressStore.forBook(bookId)?.locationJson ? JSON.parse(progressStore.forBook(bookId)!.locationJson) : null"
        :initial-percent="progressStore.forBook(bookId)?.percent"
        @progress="onProgress"
        @page-change="onPageChange"
      />

      <div v-else class="absolute inset-0 flex items-center justify-center text-parchment">
        <p>Unable to load book</p>
      </div>
    </main>
  </div>
</template>
