<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import {
  PROGRESS_SAVE_DEBOUNCE_MS,
  PDF_RENDER_SCALE,
  PDF_OBSERVER_ROOT_MARGIN,
  PDF_OBSERVER_THRESHOLD,
} from '@/constants'

const props = defineProps<{
  contentUrl: string
  initialPage?: number | null
  initialPercent?: number | null
}>()

const emit = defineEmits<{
  progress: [location: Record<string, unknown>, percent: number]
  pageChange: [page: number, total: number]
}>()

const loading = ref(true)
const error = ref<string | null>(null)
const pdfContainer = ref<HTMLDivElement | null>(null)

let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
let currentPage = 1
let saveTimer: ReturnType<typeof setTimeout>

function scheduleSave(location: Record<string, unknown>, percent: number) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => emit('progress', location, percent), PROGRESS_SAVE_DEBOUNCE_MS)
}

async function renderPdfPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  container: HTMLElement
) {
  if (container.querySelector('canvas')) return

  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })

  const canvas = document.createElement('canvas')
  canvas.height = viewport.height
  canvas.width = viewport.width
  canvas.className = 'mx-auto shadow-lg max-w-full h-auto bg-white'

  container.appendChild(canvas)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvas, viewport } as any).promise
}

onMounted(async () => {
  if (!pdfContainer.value) return
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()

    const loadingTask = pdfjsLib.getDocument(props.contentUrl)
    pdfDoc = await loadingTask.promise

    const totalPages = pdfDoc.numPages
    emit('pageChange', 1, totalPages)

    const placeholders: HTMLElement[] = []

    for (let i = 1; i <= totalPages; i++) {
      const div = document.createElement('div')
      div.dataset.page = i.toString()
      div.className = 'mx-auto my-8 relative flex items-center justify-center'
      div.style.minHeight = '800px'
      div.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-parchment/10 font-bold text-6xl">${i}</div>`
      pdfContainer.value.appendChild(div)
      placeholders.push(div)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && pdfDoc) {
            const pageNum = parseInt((entry.target as HTMLElement).dataset.page || '1')
            renderPdfPage(pdfDoc, pageNum, entry.target as HTMLElement)
          }
        })
      },
      {
        root: pdfContainer.value,
        rootMargin: PDF_OBSERVER_ROOT_MARGIN,
        threshold: PDF_OBSERVER_THRESHOLD,
      }
    )

    placeholders.forEach((p) => observer.observe(p))

    const savedPage = props.initialPage
    if (savedPage && savedPage <= totalPages) {
      setTimeout(() => {
        const target = pdfContainer.value?.querySelector(`[data-page="${savedPage}"]`)
        if (target) target.scrollIntoView()
      }, 100)
    }

    pdfContainer.value.addEventListener('scroll', () => {
      if (!pdfContainer.value || !pdfDoc) return
      const els = Array.from(pdfContainer.value.querySelectorAll('div[data-page]'))
      const containerTop = pdfContainer.value.getBoundingClientRect().top

      let closest = 1
      let minDiff = Infinity

      for (const el of els) {
        const rect = el.getBoundingClientRect()
        const diff = Math.abs(rect.top - containerTop)
        if (diff < minDiff) {
          minDiff = diff
          closest = parseInt((el as HTMLElement).dataset.page || '1')
        }
      }

      if (closest !== currentPage) {
        currentPage = closest
        emit('pageChange', currentPage, totalPages)
        scheduleSave({ page: currentPage }, (currentPage / totalPages) * 100)
      }
    })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load PDF'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  clearTimeout(saveTimer)
  pdfDoc?.destroy()
})
</script>

<template>
  <div class="relative w-full h-full">
    <div v-if="loading" class="flex items-center justify-center h-full text-sage text-lg">
      Loading PDF...
    </div>
    <div v-else-if="error" class="flex items-center justify-center h-full px-8 text-center text-clay">
      {{ error }}
    </div>
    <div
      v-else
      ref="pdfContainer"
      class="w-full h-full overflow-y-auto p-4 scroll-smooth"
      :style="{ backgroundColor: '#2b2118' }"
    />
  </div>
</template>
