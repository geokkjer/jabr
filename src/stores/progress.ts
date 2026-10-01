import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Effect } from 'effect'
import { ProgressApi } from '@/services/api'
import type { BookProgress } from '@/types'

export const useProgressStore = defineStore('progress', () => {
  // ── State ──
  const progressByBook = ref<Record<string, BookProgress>>({})
  const loading = ref(false)

  // ── Getters ──
  const forBook = computed(() => (bookId: string): BookProgress | undefined =>
    progressByBook.value[bookId],
  )

  const recentlyRead = computed(() =>
    Object.values(progressByBook.value)
      .filter((p) => (p.percent ?? 0) > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 4),
  )

  // ── Actions ──
  async function fetchProgress(profileId: string, bookId: string) {
    loading.value = true
    try {
      const result = await Effect.runPromise(ProgressApi.get(profileId, bookId))
      if (result) {
        progressByBook.value[bookId] = result as BookProgress
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchAllProgress(profileId: string) {
    if (!profileId) return
    loading.value = true
    try {
      const result = await Effect.runPromise(ProgressApi.listRecent(profileId))
      const map: Record<string, BookProgress> = {}
      for (const p of result as BookProgress[]) {
        map[p.bookId] = p
      }
      progressByBook.value = map
    } finally {
      loading.value = false
    }
  }

  async function saveProgress(
    profileId: string,
    bookId: string,
    data: { format: string; location: Record<string, unknown>; percent: number },
  ) {
    const now = Date.now()
    const entry: BookProgress = {
      profileId,
      bookId,
      format: data.format,
      locationJson: JSON.stringify(data.location),
      percent: data.percent,
      updatedAt: now,
    }

    progressByBook.value[bookId] = entry
    await Effect.runPromise(ProgressApi.save(profileId, bookId, data))
  }

  function clearProgress() {
    progressByBook.value = {}
  }

  return {
    progressByBook,
    loading,
    forBook,
    recentlyRead,
    fetchProgress,
    fetchAllProgress,
    saveProgress,
    clearProgress,
  }
})
