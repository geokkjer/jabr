<script setup lang="ts">
defineProps<{
  contentUrl: string
}>()
</script>

<template>
  <iframe
    :src="contentUrl"
    class="w-full h-full border-0 bg-card p-8 font-serif text-lg leading-relaxed max-w-3xl mx-auto"
  />
</template>
