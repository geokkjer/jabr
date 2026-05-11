<script setup lang="ts">
import type { Book } from '@/types'

interface Props {
  book: Book
  progress?: number | null
}

defineProps<Props>()
const emit = defineEmits<{ click: [book: Book]; read: [book: Book] }>()

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div
    class="group relative block h-full bg-card border-4 border-coffee rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-brutal-lg active:translate-y-0 active:shadow-none cursor-pointer"
    @click="emit('click', book)"
  >
    <div class="flex flex-col h-full justify-between gap-6">
      <div>
        <div class="flex justify-between items-start mb-4">
          <span
            class="inline-block px-3 py-1 bg-forest text-parchment text-xs font-bold uppercase tracking-wider rounded-full border-2 border-coffee"
          >
            {{ book.format }}
          </span>
          <span class="text-xs font-bold text-leather font-mono">
            {{ formatSize(book.size) }}
          </span>
        </div>
        <h2
          class="text-3xl font-bold text-coffee leading-tight mb-2 line-clamp-3 group-hover:text-ocher transition-colors"
        >
          {{ book.title || 'Untitled' }}
        </h2>
      </div>

      <div class="border-t-2 border-coffee/20 pt-4">
        <p class="text-lg font-medium text-leather truncate">
          {{ book.author || 'Unknown Author' }}
        </p>
      </div>
    </div>

    <div
      v-if="progress && progress > 0"
      class="mt-4 h-2 rounded-full bg-sage/20 overflow-hidden"
    >
      <div
        class="h-full rounded-full bg-ocher transition-all duration-300"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>
