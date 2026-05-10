<script setup lang="ts">
const modelValue = defineModel<string>({ default: '' })

function clear() {
  modelValue.value = ''
}
</script>

<template>
  <div class="relative">
    <input
      v-model="modelValue"
      type="text"
      placeholder="Search books..."
      class="w-full pl-10 pr-4 py-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee placeholder-sage/60 focus:border-ocher focus:outline-none transition-colors"
    />
    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <button
      v-if="modelValue"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-sage hover:text-coffee transition-colors"
      @click="clear"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
