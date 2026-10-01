/**
 * Auth & Settings store tests — covers Login, Logout, UpdateSettings,
 * ToggleAuthentication rules from the store perspective.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Singleton mock API objects — all calls return the same instance
const mockAuthApi = {
  login: vi.fn(),
  logout: vi.fn(),
  status: vi.fn(),
}
const mockSettingsApi = {
  get: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
}

vi.mock('@/composables/useApi', () => ({
  useBooksApi: () => ({
    list: vi.fn(),
    search: vi.fn(),
    getById: vi.fn(),
    getContentUrl: vi.fn(() => '/api/book/test'),
    upload: vi.fn(),
  }),
  useProfilesApi: () => ({
    list: vi.fn(),
    create: vi.fn(),
  }),
  useProgressApi: () => ({
    get: vi.fn(),
    save: vi.fn(),
  }),
  useSettingsApi: () => mockSettingsApi,
  useAuthApi: () => mockAuthApi,
}))

import { useAuthStore, useSettingsStore } from '../auth'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

// ============================================================
// Auth Store — covers Login, Logout rules
// ============================================================
describe('useAuthStore', () => {
  describe('checkStatus', () => {
    it('auto-authenticates when auth is disabled', async () => {
      mockAuthApi.status.mockResolvedValue({ authEnabled: false })

      const store = useAuthStore()
      await store.checkStatus()

      expect(store.isAuthenticated).toBe(true)
      expect(store.authEnabled).toBe(false)
    })

    it('stays unauthenticated when auth is enabled', async () => {
      mockAuthApi.status.mockResolvedValue({ authEnabled: true })

      const store = useAuthStore()
      await store.checkStatus()

      expect(store.isAuthenticated).toBe(false)
      expect(store.authEnabled).toBe(true)
    })
  })

  describe('login', () => {
    it('sets isAuthenticated on successful login', async () => {
      mockAuthApi.login.mockResolvedValue(undefined)

      const store = useAuthStore()
      await store.login('admin', 'password')

      expect(store.isAuthenticated).toBe(true)
      expect(store.error).toBeNull()
    })

    it('sets error on failed login and re-throws', async () => {
      mockAuthApi.login.mockRejectedValue(new Error('Invalid credentials'))

      const store = useAuthStore()
      await expect(store.login('admin', 'wrong')).rejects.toThrow('Invalid credentials')

      expect(store.isAuthenticated).toBe(false)
      expect(store.error).toBe('Invalid credentials')
    })
  })

  describe('logout', () => {
    it('clears authentication on logout', async () => {
      mockAuthApi.login.mockResolvedValue(undefined)
      mockAuthApi.logout.mockResolvedValue(undefined)

      const store = useAuthStore()
      await store.login('admin', 'password')
      expect(store.isAuthenticated).toBe(true)

      await store.logout()
      expect(store.isAuthenticated).toBe(false)
    })
  })
})

// ============================================================
// Settings Store — covers UpdateSettings, ToggleAuthentication rules
// ============================================================
describe('useSettingsStore', () => {
  it('fetches settings', async () => {
    mockSettingsApi.get.mockResolvedValue({
      libraryPath: '/books',
      authEnabled: 'false',
      username: null,
      password: null,
      readerTarget: null,
      calibreMigrated: null,
      calibreLibraryPath: null,
    })

    const store = useSettingsStore()
    await store.fetchSettings()

    expect(store.settings.libraryPath).toBe('/books')
    expect(store.settings.authEnabled).toBe('false')
  })

  it('saves partial settings', async () => {
    mockSettingsApi.get.mockResolvedValue({
      libraryPath: '/books',
      authEnabled: 'false',
      username: null,
      password: null,
      readerTarget: null,
      calibreMigrated: null,
      calibreLibraryPath: null,
    })
    mockSettingsApi.save.mockResolvedValue(undefined)

    const store = useSettingsStore()
    await store.fetchSettings()

    await store.saveSettings({ authEnabled: 'true', username: 'admin' })
    expect(store.settings.authEnabled).toBe('true')
    expect(store.settings.username).toBe('admin')
    expect(store.settings.libraryPath).toBe('/books')
  })

  it('handles save error and re-throws', async () => {
    mockSettingsApi.save.mockRejectedValue(new Error('Save failed'))

    const store = useSettingsStore()
    await expect(store.saveSettings({ libraryPath: '/bad' })).rejects.toThrow('Save failed')
    expect(store.error).toBe('Save failed')
  })

  it('calls reset on resetDatabase', async () => {
    mockSettingsApi.reset.mockResolvedValue(undefined)

    const store = useSettingsStore()
    await store.resetDatabase()
    expect(mockSettingsApi.reset).toHaveBeenCalled()
  })
})
