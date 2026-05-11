<script setup lang="ts">
const searchQuery = defineModel<string>('search', { default: '' })
const sortBy = defineModel<string>('sort', { default: 'title' })
const sortOrder = defineModel<'asc' | 'desc'>('order', { default: 'asc' })

const fields = ['title', 'author', 'size', 'mtime'] as const

function toggleSort(field: string) {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = field === 'size' || field === 'mtime' ? 'desc' : 'asc'
  }
}

function clear() {
  searchQuery.value = ''
}
</script>

<template>
  <div class="flex flex-col md:flex-row items-center justify-center gap-4">
    <div class="relative w-full md:w-96">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search title or author..."
        class="w-full px-6 py-3 bg-card text-coffee font-bold placeholder-leather/50 border-4 border-coffee rounded-2xl focus:outline-none focus:shadow-brutal transition-all text-lg"
      />
      <button
        v-if="searchQuery"
        class="absolute right-4 top-1/2 -translate-y-1/2 text-leather hover:text-coffee transition-colors"
        @click="clear"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="flex flex-wrap items-center justify-center gap-2">
      <button
        v-for="field in fields"
        :key="field"
        class="px-4 py-2 text-sm font-bold uppercase border-2 border-coffee rounded-xl transition-all"
        :class="{
          'bg-forest text-parchment shadow-brutal': sortBy === field,
          'bg-card text-coffee hover:bg-parchment hover:shadow-[2px_2px_0px_0px_var(--color-shadow)]': sortBy !== field,
        }"
        @click="toggleSort(field)"
      >
        {{ field }}
        <span v-if="sortBy === field" class="ml-1">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
      </button>
    </div>
  </div>
</template>
