import { defineStore } from 'pinia'
import type { BookProgress } from '@/types'
import { useProgressApi } from '@/composables/useProgressApi'

export const useProgressStore = defineStore('progress', {
  state: () => ({
    progressByBook: {} as Record<string, BookProgress>,
    loading: false,
  }),

  getters: {
    forBook: (state) => (bookId: string): BookProgress | undefined =>
      state.progressByBook[bookId],

    currentlyReading: (state): BookProgress | undefined =>
      Object.values(state.progressByBook).find(
        p => p.percent > 0 && p.percent < 100
      ),

    recentlyRead: (state): BookProgress[] =>
      Object.values(state.progressByBook)
        .filter(p => p.percent > 0)
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5),
  },

  actions: {
    async fetchProgress(profileId: string, bookId: string) {
      this.loading = true
      try {
        const { get } = useProgressApi()
        const progress = await get(profileId, bookId)
        if (progress) {
          this.progressByBook[bookId] = progress
        }
      } finally {
        this.loading = false
      }
    },

    async saveProgress(profileId: string, bookId: string, data: Partial<BookProgress>) {
      const now = Date.now()
      const entry: BookProgress = {
        profile_id: profileId,
        book_id: bookId,
        format: data.format || '',
        location: data.location || {},
        percent: data.percent ?? 0,
        updated_at: now,
      }

      this.progressByBook[bookId] = entry

      const { upsert } = useProgressApi()
      await upsert({
        profile_id: profileId,
        book_id: bookId,
        format: entry.format,
        location: entry.location,
        percent: entry.percent,
        updated_at: now,
      })
    },

    clearProgress() {
      this.progressByBook = {}
    },
  },
})
