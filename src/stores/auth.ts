import { defineStore } from 'pinia'
import { useAuthApi, useSettingsApi } from '@/composables/useApi'
import type { Settings } from '@/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    isAuthenticated: false,
    authEnabled: false,
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async checkStatus() {
      try {
        const { status } = useAuthApi()
        const { authEnabled } = await status()
        this.authEnabled = authEnabled
        if (!authEnabled) {
          this.isAuthenticated = true
        }
      } catch (e) {
        console.error('Failed to check auth status:', e)
      }
    },

    async login(username: string, password: string) {
      this.loading = true
      this.error = null
      try {
        const { login } = useAuthApi()
        await login(username, password)
        this.isAuthenticated = true
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Login failed'
        throw e
      } finally {
        this.loading = false
      }
    },

    async logout() {
      try {
        const { logout } = useAuthApi()
        await logout()
        this.isAuthenticated = false
      } catch (e) {
        console.error('Logout failed:', e)
      }
    },
  },
})

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: {
      libraryPath: null,
      authEnabled: null,
      username: null,
      password: null,
      readerTarget: null,
      calibreMigrated: null,
      calibreLibraryPath: null,
    } as Settings,
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchSettings() {
      this.loading = true
      this.error = null
      try {
        const { get } = useSettingsApi()
        this.settings = await get()
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to fetch settings'
      } finally {
        this.loading = false
      }
    },

    async saveSettings(partial: Partial<Settings>) {
      this.loading = true
      this.error = null
      try {
        const { save } = useSettingsApi()
        await save(partial)
        this.settings = { ...this.settings, ...partial }
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to save settings'
        throw e
      } finally {
        this.loading = false
      }
    },

    async migrateFromCalibre(
      libraryPath: string,
      options?: { preferFormat?: string; dryRun?: boolean }
    ) {
      const res = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryPath, ...options }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(err)
      }
      return res.json() as Promise<import('@/types').MigrateResult>
    },

    async resetDatabase() {
      this.loading = true
      this.error = null
      try {
        const { reset } = useSettingsApi()
        await reset()
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to reset database'
        throw e
      } finally {
        this.loading = false
      }
    },
  },
})
