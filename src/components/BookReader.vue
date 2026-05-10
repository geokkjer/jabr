<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ePub from 'epubjs'
import * as pdfjsLib from 'pdfjs-dist'

const props = defineProps<{
  bookId: string
  format: string
  contentUrl: string
  initialLocation?: Record<string, unknown> | null
  initialPercent?: number | null
}>()

const emit = defineEmits<{
  progress: [location: Record<string, unknown>, percent: number]
}>()

const loading = ref(true)
const error = ref<string | null>(null)
const container = ref<HTMLDivElement | null>(null)
const pdfContainer = ref<HTMLDivElement | null>(null)

let rendition: any = null
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
let currentPage = 1
let saveTimer: ReturnType<typeof setTimeout>

function scheduleSave(location: Record<string, unknown>, percent: number) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => emit('progress', location, percent), 750)
}

async function initEpub() {
  if (!container.value) return
  const book = ePub(props.contentUrl)
  rendition = book.renderTo(container.value, {
    width: '100%',
    height: '100%',
    flow: 'scrolled-doc',
  })

  const cfi = props.initialLocation?.cfi as string | undefined
  await (cfi ? rendition.display(cfi) : rendition.display())

  rendition.on('relocated', (loc: { start?: { cfi?: string }; percentage?: number }) => {
    const cfi = loc.start?.cfi
    if (cfi) {
      scheduleSave({ cfi }, (loc.percentage ?? 0) * 100)
    }
  })
}

async function initPdf() {
  if (!pdfContainer.value) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
  ).toString()

  const loadingTask = pdfjsLib.getDocument(props.contentUrl)
  pdfDoc = await loadingTask.promise

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.setAttribute('data-page', String(i))
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.className = 'mb-4 shadow-lg'
    await page.render({ canvas, viewport }).promise
    pdfContainer.value.appendChild(canvas)
  }

  const savedPage = props.initialLocation?.page as number | undefined
  if (savedPage && savedPage <= pdfDoc.numPages) {
    const el = pdfContainer.value.querySelector(`[data-page="${savedPage}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'start' })
  }

  pdfContainer.value.addEventListener('scroll', () => {
    if (!pdfContainer.value || !pdfDoc) return
    const els = pdfContainer.value.querySelectorAll('[data-page]')
    const containerTop = pdfContainer.value.getBoundingClientRect().top
    let closest = 1, minDiff = Infinity
    els.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const diff = Math.abs(rect.top - containerTop)
      if (diff < minDiff) {
        minDiff = diff
        closest = parseInt(el.getAttribute('data-page') || '1')
      }
    })
    if (closest !== currentPage) {
      currentPage = closest
      scheduleSave({ page: closest }, (closest / (pdfDoc?.numPages ?? 1)) * 100)
    }
  })
}

onMounted(async () => {
  try {
    loading.value = true
    if (props.format === 'epub') await initEpub()
    else if (props.format === 'pdf') await initPdf()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load reader'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  clearTimeout(saveTimer)
  rendition?.destroy()
  pdfDoc?.destroy()
  URL.revokeObjectURL(props.contentUrl)
})
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center h-full text-sage text-lg">
    Loading reader...
  </div>
  <div v-else-if="error" class="flex items-center justify-center h-full px-8 text-center text-clay">
    {{ error }}
  </div>
  <div v-else-if="format === 'epub'" ref="container" class="w-full h-full" />
  <div
    v-else-if="format === 'pdf'"
    ref="pdfContainer"
    class="w-full h-full overflow-y-auto"
    :style="{ backgroundColor: '#2b2118' }"
  />
  <iframe
    v-else
    :src="contentUrl"
    class="w-full h-full border-0"
  />
</template>
