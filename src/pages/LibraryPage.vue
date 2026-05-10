<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { useProgressStore } from '@/stores/progress'
import { useProfilesStore } from '@/stores/profiles'
import { storeToRefs } from 'pinia'
import type { Book } from '@/types'
import BookCard from '@/components/BookCard.vue'
import SearchBar from '@/components/SearchBar.vue'
import SortControls from '@/components/SortControls.vue'

const router = useRouter()
const booksStore = useBooksStore()
const progressStore = useProgressStore()
const profilesStore = useProfilesStore()
const { filteredBooks, loading, error, search, sort, order } = storeToRefs(booksStore)

onMounted(async () => {
  await Promise.all([
    profilesStore.fetchProfiles(),
    booksStore.fetchBooks(),
  ])
})

function openBook(book: Book) {
  router.push(`/read/${book.id}`)
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <h1 class="font-display text-3xl font-bold text-coffee">Library</h1>
      <nav class="flex items-center gap-4">
        <router-link to="/settings" class="text-sage hover:text-ocher transition-colors font-medium">
          Settings
        </router-link>
      </nav>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-4 mb-6">
      <SearchBar v-model="search" class="flex-1 max-w-md" />
      <SortControls v-model:sort="sort" v-model:order="order" />
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 p-4 rounded-xl bg-clay/10 border border-clay/30 text-clay font-medium">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-16 text-sage">Loading...</div>

    <!-- Empty -->
    <div v-else-if="filteredBooks.length === 0" class="text-center py-16">
      <p class="text-sage text-lg">No books found</p>
      <p class="text-sage/60 text-sm mt-1">
        {{ search ? 'Try a different search' : 'Import your books to get started' }}
      </p>
    </div>

    <!-- Book Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <BookCard
        v-for="(book, i) in filteredBooks"
        :key="book.id || i"
        :book="book"
        :progress="progressStore.forBook(book.id)?.percent"
        @click="openBook"
        @read="openBook"
      />
    </div>
  </div>
</template>
