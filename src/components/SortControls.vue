<script setup lang="ts">
defineProps<{ sort: string; order: 'asc' | 'desc' }>()
const emit = defineEmits<{ 'update:sort': [v: string]; 'update:order': [v: 'asc' | 'desc'] }>()

const options = [
  { label: 'Title', value: 'title' },
  { label: 'Author', value: 'author' },
  { label: 'Size', value: 'size' },
  { label: 'Date', value: 'mtime' },
]
</script>

<template>
  <div class="flex items-center gap-2">
    <select
      :value="sort"
      class="px-3 py-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee text-sm focus:border-ocher focus:outline-none"
      @change="emit('update:sort', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <button
      class="p-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee hover:border-ocher transition-colors"
      :title="order === 'asc' ? 'Ascending' : 'Descending'"
      @click="emit('update:order', order === 'asc' ? 'desc' : 'asc')"
    >
      <svg v-if="order === 'asc'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
      </svg>
      <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
      </svg>
    </button>
  </div>
</template>
