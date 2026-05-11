<script setup lang="ts">
import type { Book } from '@/types'

interface Props {
  books: Book[]
}

defineProps<Props>()
const emit = defineEmits<{ click: [book: Book] }>()
</script>

<template>
  <section v-if="books.length > 0" class="mb-12">
    <h2
      class="text-xs font-bold uppercase tracking-widest text-leather mb-4 flex items-center gap-2"
    >
      <span class="w-8 h-px bg-leather/30"></span>
      Currently Reading
    </h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="book in books"
        :key="book.id"
        class="group flex items-center gap-4 p-3 bg-card/50 border-2 border-coffee/20 rounded-xl hover:border-coffee hover:bg-card transition-all cursor-pointer"
        @click="emit('click', book)"
      >
        <div class="flex-1 min-w-0">
          <p
            class="font-bold text-coffee truncate text-sm group-hover:text-ocher transition-colors"
          >
            {{ book.title }}
          </p>
          <p class="text-xs text-leather truncate italic">
            {{ book.author }}
          </p>
        </div>
        <span
          class="text-[10px] font-bold text-forest uppercase bg-forest/10 px-2 py-0.5 rounded-full border border-forest/20"
        >
          {{ book.format }}
        </span>
      </div>
    </div>
  </section>
</template>
