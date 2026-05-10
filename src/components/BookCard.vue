<script setup lang="ts">
import type { Book } from '@/types'

interface Props {
  book: Book
  progress?: number | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ click: [book: Book]; read: [book: Book] }>()

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div
    class="rounded-xl border-2 border-coffee/10 bg-card p-4 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
    @click="emit('click', book)"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="font-display font-bold text-lg truncate text-coffee">
          {{ book.title || 'Untitled' }}
        </h3>
        <p class="text-sm text-leather truncate mt-0.5">
          {{ book.author || 'Unknown Author' }}
        </p>
      </div>
      <span class="shrink-0 px-2 py-0.5 text-xs font-bold rounded-md bg-ocher/10 text-ocher uppercase">
        {{ book.format }}
      </span>
    </div>

    <div class="mt-4 flex items-center justify-between text-sm">
      <span class="text-sage">{{ formatSize(book.size) }}</span>
      <button
        v-if="progress"
        class="font-bold text-ocher hover:text-ocher/80 transition-colors"
        @click.stop="emit('read', book)"
      >
        Resume {{ Math.round(progress) }}%
      </button>
      <button
        v-else
        class="font-bold text-forest hover:text-forest/80 transition-colors"
        @click.stop="emit('read', book)"
      >
        Read
      </button>
    </div>

    <div
      v-if="progress"
      class="mt-3 h-1.5 rounded-full bg-sage/20 overflow-hidden"
    >
      <div
        class="h-full rounded-full bg-ocher transition-all duration-300"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>
