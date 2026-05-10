<script setup lang="ts">
import type { Book } from '@/types'

defineProps<{ book: Book; progress: number }>()
const emit = defineEmits<{ continue: []; stop: [] }>()
</script>

<template>
  <div class="rounded-xl border-2 border-ocher/20 bg-ocher/5 p-4">
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold uppercase tracking-wider text-ocher">Currently Reading</p>
        <h3 class="font-display font-bold text-lg text-coffee truncate mt-0.5">{{ book.title }}</h3>
        <p class="text-sm text-leather truncate">{{ book.author }}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          class="px-4 py-1.5 rounded-xl bg-ocher text-white font-bold text-sm hover:bg-ocher/90 transition-colors"
          @click="emit('continue')"
        >
          Continue
        </button>
        <button
          class="p-1.5 rounded-lg text-sage hover:text-clay transition-colors"
          title="Stop reading"
          @click="emit('stop')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
    <div class="mt-3 h-2 rounded-full bg-ocher/10 overflow-hidden">
      <div
        class="h-full rounded-full bg-ocher transition-all"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>
