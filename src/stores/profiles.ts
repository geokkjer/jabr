import { defineStore } from 'pinia'
import type { Profile } from '@/types'
import { useProfilesApi } from '@/composables/useProfilesApi'

export const useProfilesStore = defineStore('profiles', {
  state: () => ({
    profiles: [] as Profile[],
    activeId: '' as string,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    activeProfile(state): Profile | undefined {
      return state.profiles.find(p => p.id === state.activeId)
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
      if (saved && this.profiles.some(p => p.id === saved)) {
        this.activeId = saved
      } else if (!this.activeId) {
        const first = this.profiles[0]
        if (first) this.activeId = first.id
      }
    },
  },
})
