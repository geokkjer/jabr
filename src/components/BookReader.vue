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
  pageChange: [page: number, total: number]
}>()

const loading = ref(true)
const error = ref<string | null>(null)
const container = ref<HTMLDivElement | null>(null)
const pdfContainer = ref<HTMLDivElement | null>(null)

let rendition: ReturnType<typeof ePub.prototype.renderTo> | null = null
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

  // Inject dark theme styles
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

  const cfi = props.initialLocation?.cfi as string | undefined
  await (cfi ? rendition.display(cfi) : rendition.display())

  rendition.on('relocated', (loc: { start?: { cfi?: string }; percentage?: number }) => {
    const cfi = loc.start?.cfi
    if (cfi) {
      scheduleSave({ cfi }, (loc.percentage ?? 0) * 100)
    }
  })
}

function prevPage() {
  if (rendition) rendition.prev()
}

function nextPage() {
  if (rendition) rendition.next()
}

async function initPdf() {
  if (!pdfContainer.value) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  const loadingTask = pdfjsLib.getDocument(props.contentUrl)
  pdfDoc = await loadingTask.promise

  const totalPages = pdfDoc.numPages
  emit('pageChange', 1, totalPages)

  // Render all pages with lazy loading using IntersectionObserver
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
      rootMargin: '1000px',
      threshold: 0.1,
    }
  )

  placeholders.forEach((p) => observer.observe(p))

  // Scroll to saved page
  const savedPage = props.initialLocation?.page as number | undefined
  if (savedPage && savedPage <= totalPages) {
    setTimeout(() => {
      const target = pdfContainer.value?.querySelector(`[data-page="${savedPage}"]`)
      if (target) target.scrollIntoView()
    }, 100)
  }

  // Track scroll to update current page
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
}

async function renderPdfPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  container: HTMLElement
) {
  if (container.querySelector('canvas')) return

  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1.5 })

  const canvas = document.createElement('canvas')
  canvas.height = viewport.height
  canvas.width = viewport.width
  canvas.className = 'mx-auto shadow-lg max-w-full h-auto bg-white'

  container.appendChild(canvas)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvas, viewport } as any).promise
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
})
</script>

<template>
  <div class="relative w-full h-full">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full text-sage text-lg">
      Loading reader...
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex items-center justify-center h-full px-8 text-center text-clay">
      {{ error }}
    </div>

    <!-- EPUB -->
    <div v-else-if="format === 'epub'" class="relative w-full h-full">
      <div ref="container" class="w-full h-full" />
      <!-- EPUB Navigation -->
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

    <!-- PDF -->
    <div
      v-else-if="format === 'pdf'"
      ref="pdfContainer"
      class="w-full h-full overflow-y-auto p-4 scroll-smooth"
      :style="{ backgroundColor: '#2b2118' }"
    />

    <!-- Text -->
    <iframe
      v-else
      :src="contentUrl"
      class="w-full h-full border-0 bg-card p-8 font-serif text-lg leading-relaxed max-w-3xl mx-auto"
    />
  </div>
</template>
