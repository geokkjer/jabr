<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ePub from 'epubjs'
import { PROGRESS_SAVE_DEBOUNCE_MS } from '@/constants'

const props = defineProps<{
  contentUrl: string
  initialCfi?: string | null
  initialPercent?: number | null
}>()

const emit = defineEmits<{
  progress: [location: Record<string, unknown>, percent: number]
}>()

const container = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

let rendition: ReturnType<typeof ePub.prototype.renderTo> | null = null
let saveTimer: ReturnType<typeof setTimeout>

function scheduleSave(location: Record<string, unknown>, percent: number) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => emit('progress', location, percent), PROGRESS_SAVE_DEBOUNCE_MS)
}

onMounted(async () => {
  if (!container.value) return
  try {
    const book = ePub(props.contentUrl)
    rendition = book.renderTo(container.value, {
      width: '100%',
      height: '100%',
      flow: 'scrolled-doc',
    })

    rendition.hooks.content.register((contents: { addStylesheetRules: (rules: Record<string, Record<string, string>>) => void }) => {
      contents.addStylesheetRules({
        'html, body': {
          'background-color': '#2b2118 !important',
          color: '#fdfdf7 !important',
          'font-family': 'serif !important',
        },
        'p, div, span, h1, h2, h3, h4, h5, h6, li, a, section, article, main': {
          color: '#fdfdf7 !important',
          'background-color': 'transparent !important',
        },
        img: {
          'max-width': '100% !important',
          height: 'auto !important',
        },
      })
    })

    const cfi = props.initialCfi
    await (cfi ? rendition.display(cfi) : rendition.display())

    rendition.on('relocated', (loc: { start?: { cfi?: string }; percentage?: number }) => {
      const cfi = loc.start?.cfi
      if (cfi) {
        scheduleSave({ cfi }, (loc.percentage ?? 0) * 100)
      }
    })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load EPUB'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  clearTimeout(saveTimer)
  rendition?.destroy()
})

function prevPage() {
  rendition?.prev()
}

function nextPage() {
  rendition?.next()
}
</script>

<template>
  <div class="relative w-full h-full">
    <div v-if="loading" class="flex items-center justify-center h-full text-sage text-lg">
      Loading EPUB...
    </div>
    <div v-else-if="error" class="flex items-center justify-center h-full px-8 text-center text-clay">
      {{ error }}
    </div>
    <div v-else class="relative w-full h-full">
      <div ref="container" class="w-full h-full" />
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-10">
        <button
          class="px-4 py-2 bg-parchment text-coffee font-bold border-2 border-coffee rounded-lg shadow-brutal hover:translate-y-px hover:shadow-[2px_2px_0px_0px_var(--color-shadow)] active:translate-y-1 active:shadow-none transition-all"
          @click="prevPage"
        >
          Prev
        </button>
        <button
          class="px-4 py-2 bg-ocher text-coffee font-bold border-2 border-coffee rounded-lg shadow-brutal hover:translate-y-px hover:shadow-[2px_2px_0px_0px_var(--color-shadow)] active:translate-y-1 active:shadow-none transition-all"
          @click="nextPage"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
