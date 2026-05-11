import { defineStore } from 'pinia'
import type { Profile, BookProgress } from '@/types'
import { useProfilesApi, useProgressApi } from '@/composables/useApi'

export const useProfilesStore = defineStore('profiles', {
  state: () => ({
    profiles: [] as Profile[],
    activeId: '' as string,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    activeProfile(state): Profile | undefined {
      return state.profiles.find((p) => p.id === state.activeId)
    },
  },

  actions: {
    async fetchProfiles() {
      this.loading = true
      this.error = null
      try {
        const { list } = useProfilesApi()
        this.profiles = await list()
        this._restoreActiveProfile()
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to fetch profiles'
      } finally {
        this.loading = false
      }
    },

    async createProfile(name: string) {
      const { create } = useProfilesApi()
      const profile = await create(name)
      this.profiles.push(profile)
      this.activeId = profile.id
      localStorage.setItem('jabr-profile', profile.id)
    },

    setActiveProfile(id: string) {
      this.activeId = id
      localStorage.setItem('jabr-profile', id)
    },

    _restoreActiveProfile() {
      const saved = localStorage.getItem('jabr-profile')
      if (saved && this.profiles.some((p) => p.id === saved)) {
        this.activeId = saved
      } else if (!this.activeId) {
        const first = this.profiles[0]
        if (first) this.activeId = first.id
      }
    },
  },
})

export const useProgressStore = defineStore('progress', {
  state: () => ({
    progressByBook: {} as Record<string, BookProgress>,
    loading: false,
  }),

  getters: {
    forBook: (state) => (bookId: string): BookProgress | undefined =>
      state.progressByBook[bookId],

    recentlyRead: (state): BookProgress[] =>
      Object.values(state.progressByBook)
        .filter((p) => (p.percent ?? 0) > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4),
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

    async fetchAllProgress(profileId: string) {
      // Fetch recent progress for all books
      // Since we don't have a bulk endpoint, we'll fetch on demand
      // The recentlyRead getter will work with what we have
    },

    async saveProgress(
      profileId: string,
      bookId: string,
      data: { format: string; location: Record<string, unknown>; percent: number }
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

      this.progressByBook[bookId] = entry

      const { save } = useProgressApi()
      await save(profileId, bookId, data)
    },

    clearProgress() {
      this.progressByBook = {}
    },
  },
})
