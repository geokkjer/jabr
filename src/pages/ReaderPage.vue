<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBooksApi } from '@/composables/useBooksApi'
import { useProgressStore } from '@/stores/progress'
import { useProfilesStore } from '@/stores/profiles'
import BookReader from '@/components/BookReader.vue'
import type { Book } from '@/types'

const route = useRoute()
const router = useRouter()
const profilesStore = useProfilesStore()
const progressStore = useProgressStore()

const bookId = computed(() => route.params.id as string)
const book = ref<Book | null>(null)
const contentUrl = ref('')
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const { getById, fetchContent } = useBooksApi()
    book.value = await getById(bookId.value)
    if (!book.value) { router.push('/'); return }

    const buffer = await fetchContent(bookId.value, book.value.format)
    const blob = new Blob([buffer], {
      type: book.value.format === 'epub'
        ? 'application/epub+zip'
        : book.value.format === 'pdf'
          ? 'application/pdf'
          : 'text/plain',
    })
    contentUrl.value = URL.createObjectURL(blob)

    if (profilesStore.activeId) {
      await progressStore.fetchProgress(profilesStore.activeId, bookId.value)
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load book'
  } finally {
    loading.value = false
  }
})

function onProgress(location: Record<string, unknown>, percent: number) {
  if (profilesStore.activeId) {
    progressStore.saveProgress(profilesStore.activeId, bookId.value, {
      format: book.value?.format || '',
      location,
      percent,
    })
  }
}

onUnmounted(() => {
  if (contentUrl.value) URL.revokeObjectURL(contentUrl.value)
})
</script>

<template>
  <div
    class="h-screen flex flex-col"
    :style="{ backgroundColor: book?.format === 'epub' || book?.format === 'pdf' ? '#2b2118' : 'var(--color-parchment)' }"
  >
    <!-- Header -->
    <header class="h-16 bg-coffee border-b-4 border-ocher flex items-center px-6 justify-between shrink-0">
      <router-link
        to="/"
        class="flex items-center gap-2 text-parchment hover:text-ocher transition-colors font-display font-bold uppercase tracking-wide"
      >
        &larr; Library
      </router-link>
      <h1 class="font-display font-bold text-lg text-parchment truncate max-w-md mx-4">
        {{ book?.title || 'Loading...' }}
      </h1>
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
        v-else-if="contentUrl && book"
        :book-id="book.id"
        :format="book.format"
        :content-url="contentUrl"
        :initial-location="progressStore.forBook(bookId)?.location"
        :initial-percent="progressStore.forBook(bookId)?.percent"
        @progress="onProgress"
      />

      <div v-else class="absolute inset-0 flex items-center justify-center text-parchment">
        <p>Unable to load book</p>
      </div>
    </main>
  </div>
</template>
