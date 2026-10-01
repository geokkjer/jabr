<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { useProgressStore } from '@/stores/progress'
import { useProfilesStore } from '@/stores/profiles'
import { storeToRefs } from 'pinia'
import type { Book } from '@/types'
import BookCard from '@/components/BookCard.vue'
import SearchBar from '@/components/SearchBar.vue'
import CurrentlyReading from '@/components/CurrentlyReading.vue'
import Logo from '@/components/Logo.vue'

const router = useRouter()
const booksStore = useBooksStore()
const progressStore = useProgressStore()
const profilesStore = useProfilesStore()

const { filteredBooks, loading, error, search, sort, order } = storeToRefs(booksStore)
const { recentlyRead } = storeToRefs(progressStore)

const uploadBusy = ref(false)
const uploadSummary = ref<string | null>(null)
const uploadFailures = ref<Array<{ path: string; reason: string }>>([])

onMounted(async () => {
  // A fresh install has no profile; the server creates a starter one so
  // reading works straight away and progress has somewhere to go.
  await Promise.all([
    profilesStore.ensureDefaultProfile(),
    booksStore.fetchBooks(),
  ])
  // Needs an active profile first, so runs after the parallel fetch
  if (profilesStore.activeId) {
    await progressStore.fetchAllProgress(profilesStore.activeId)
  }
})

const currentlyReadingBooks = computed(() => {
  return recentlyRead.value
    .map((p) => filteredBooks.value.find((b) => b.id === p.bookId))
    .filter((b): b is Book => !!b)
    .slice(0, 4)
})

function openBook(book: Book) {
  router.push(`/read/${encodeURIComponent(book.id)}`)
}

async function importFiles(ev: Event) {
  const input = ev.currentTarget as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) return

  uploadBusy.value = true
  uploadSummary.value = null
  uploadFailures.value = []

  try {
    const result = await booksStore.uploadBook(files)
    uploadSummary.value = `Imported ${result.imported}, skipped ${result.skipped}, failed ${result.failed}`
    uploadFailures.value = result.files
      .filter((f) => f.status !== 'imported')
      .map((f) => ({ path: f.path, reason: f.reason ?? f.status }))
  } catch (e: unknown) {
    uploadSummary.value = e instanceof Error ? e.message : 'Import failed'
    uploadFailures.value = files.map((f) => ({
      path: f.webkitRelativePath || f.name,
      reason: 'not imported',
    }))
  } finally {
    uploadBusy.value = false
    input.value = ''
  }
}

</script>

<template>
  <div class="min-h-screen p-8 bg-parchment">
    <header class="mb-12 flex flex-col gap-8">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <!-- Left: Logo and Title -->
        <div class="flex-shrink-0 flex items-center gap-4">
          <Logo class="w-12 h-12 md:w-16 md:h-16" />
          <h1 class="text-xl md:text-2xl font-bold text-coffee tracking-tight leading-none">
            <span class="text-4xl md:text-6xl font-black">J</span>ust
            <span class="text-4xl md:text-6xl font-black">A</span>nother
            <span class="text-4xl md:text-6xl font-black">B</span>ook
            <span class="text-4xl md:text-6xl font-black">R</span>eader
          </h1>
        </div>

        <!-- Right: Actions -->
        <div class="flex items-center justify-end gap-4 flex-shrink-0">
          <router-link
            to="/settings"
            class="px-4 py-2 bg-card text-coffee font-bold border-2 border-coffee rounded-xl hover:shadow-brutal transition-all"
          >
            Settings
          </router-link>
          <label
            class="px-4 py-2 bg-ocher text-coffee font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 cursor-pointer transition-all"
            :class="{ 'opacity-60 cursor-not-allowed': uploadBusy }"
            :aria-disabled="uploadBusy"
          >
            <input
              type="file"
              class="hidden"
              multiple
              accept=".pdf,.epub,.txt,.md"
              :disabled="uploadBusy"
              @change="importFiles"
            />
            {{ uploadBusy ? 'Importing...' : 'Upload files' }}
          </label>
          <label
            class="px-4 py-2 bg-ocher text-coffee font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 cursor-pointer transition-all"
            :class="{ 'opacity-60 cursor-not-allowed': uploadBusy }"
            :aria-disabled="uploadBusy"
          >
            <input
              type="file"
              class="hidden"
              webkitdirectory
              multiple
              accept=".pdf,.epub,.txt,.md"
              :disabled="uploadBusy"
              @change="importFiles"
            />
            {{ uploadBusy ? 'Importing...' : 'Import folder' }}
          </label>
        </div>
      </div>

      <!-- Search and Sort -->
      <SearchBar v-model:search="search" v-model:sort="sort" v-model:order="order" />
    </header>

    <CurrentlyReading :books="currentlyReadingBooks" @click="openBook" />

    <!-- Loading -->
    <div v-if="loading" class="text-center py-16 text-sage">Loading...</div>

    <!-- Error -->
    <div v-else-if="error" class="mb-6 p-4 rounded-xl bg-clay/10 border-4 border-clay text-clay font-bold text-center">
      {{ error }}
    </div>

    <!-- Empty States -->
    <div v-else-if="filteredBooks.length === 0">
      <div
        class="border-4 border-coffee rounded-2xl p-12 text-center bg-card shadow-brutal-lg"
      >
        <div v-if="booksStore.bookCount === 0">
          <p class="text-2xl font-bold text-coffee mb-4">The shelves are empty.</p>
          <p class="text-lg text-leather">
            Add some books to the <code>books</code> directory to get started.
          </p>
        </div>
        <div v-else>
          <p class="text-2xl font-bold text-coffee mb-4">No books found.</p>
          <p class="text-lg text-leather">Try adjusting your search terms.</p>
        </div>
      </div>
    </div>

    <!-- Book Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
      <BookCard
        v-for="book in filteredBooks"
        :key="book.id"
        :book="book"
        :progress="progressStore.forBook(book.id)?.percent"
        @click="openBook"
      />
    </div>

    <!-- Import summary -->
    <div v-if="uploadSummary" class="mt-4">
      <p class="text-sm font-bold text-coffee">{{ uploadSummary }}</p>
      <ul v-if="uploadFailures.length" class="mt-2 text-sm text-red-600">
        <li v-for="failure in uploadFailures" :key="failure.path">
          {{ failure.path }} — {{ failure.reason }}
        </li>
      </ul>
    </div>
  </div>
</template>
