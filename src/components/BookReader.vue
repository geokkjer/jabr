<script setup lang="ts">
import EpubReader from '@/components/readers/EpubReader.vue'
import PdfReader from '@/components/readers/PdfReader.vue'
import TextReader from '@/components/readers/TextReader.vue'

defineProps<{
  bookId: string
  format: string
  contentUrl: string
  initialLocation?: Record<string, unknown> | null
  initialPercent?: number | null
}>()

const emit = defineEmits<{
  progress: [location: Record<string, unknown>, percent: number]
  pageChange: [page: number, total: number]
}>()
</script>

<template>
  <EpubReader
    v-if="format === 'epub'"
    :content-url="contentUrl"
    :initial-cfi="(initialLocation?.cfi as string | undefined) ?? null"
    :initial-percent="initialPercent"
    @progress="(loc, pct) => emit('progress', loc, pct)"
  />
  <PdfReader
    v-else-if="format === 'pdf'"
    :content-url="contentUrl"
    :initial-page="(initialLocation?.page as number | undefined) ?? null"
    :initial-percent="initialPercent"
    @progress="(loc, pct) => emit('progress', loc, pct)"
    @page-change="(page, total) => emit('pageChange', page, total)"
  />
  <TextReader
    v-else-if="format === 'txt' || format === 'md'"
    :content-url="contentUrl"
  />
  <div
    v-else
    class="flex items-center justify-center h-full text-coffee bg-parchment"
  >
    <p class="font-display font-bold">Unsupported Format</p>
  </div>
</template>
