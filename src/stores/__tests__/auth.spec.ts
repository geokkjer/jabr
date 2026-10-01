import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { Effect } from 'effect'

import { HttpError, NetworkError } from '@/services/http-client'
import type { FetchError } from '@/services/http-client'

// AuthApi.logout is called through a holder so tests can swap the effect.
const holders = vi.hoisted(() => ({
  logoutImpl: undefined as unknown as () => Effect.Effect<void, FetchError>,
}))

vi.mock('@/services/api', () => ({
  AuthApi: {
    status: vi.fn<typeof AuthApi.status>(),
    login: vi.fn<typeof AuthApi.login>(),
    logout: vi.fn<typeof AuthApi.logout>(() => holders.logoutImpl()),
  },
}))

import { AuthApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const statusMock = vi.mocked(AuthApi.status)
const loginMock = vi.mocked(AuthApi.login)

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    holders.logoutImpl = () => Effect.succeed(undefined)
    statusMock.mockReturnValue(Effect.succeed({ authEnabled: false }))
    loginMock.mockReturnValue(Effect.succeed(undefined))
  })

  describe('checkStatus', () => {
    it('treats an app without auth configured as authenticated', async () => {
      const store = useAuthStore()

      await store.checkStatus()

      expect(store.authEnabled).toBe(false)
      expect(store.isAuthenticated).toBe(true)
      expect(store.initialized).toBe(true)
    })

    it('does not authenticate when auth is enabled', async () => {
      statusMock.mockReturnValue(Effect.succeed({ authEnabled: true }))
      const store = useAuthStore()

      await store.checkStatus()

      expect(store.authEnabled).toBe(true)
      expect(store.isAuthenticated).toBe(false)
      expect(store.initialized).toBe(true)
    })

    it('falls back to auth-disabled semantics when the status call fails', async () => {
      statusMock.mockReturnValue(Effect.fail(new NetworkError('offline')))
      const store = useAuthStore()

      await store.checkStatus()

      // catchAll yields { authEnabled: false } — the app stays usable offline
      expect(store.authEnabled).toBe(false)
      expect(store.isAuthenticated).toBe(true)
      expect(store.initialized).toBe(true)
    })

    it('only queries once unless forced', async () => {
      const store = useAuthStore()

      await store.checkStatus()
      await store.checkStatus()
      expect(statusMock).toHaveBeenCalledTimes(1)

      await store.checkStatus(true)
      expect(statusMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('login', () => {
    it('sets isAuthenticated on success', async () => {
      const store = useAuthStore()

      await store.login('admin', 'secret')

      expect(loginMock).toHaveBeenCalledWith('admin', 'secret')
      expect(store.isAuthenticated).toBe(true)
      expect(store.error).toBeNull()
      expect(store.loading).toBe(false)
    })

    it('records the error and rethrows on failure', async () => {
      loginMock.mockReturnValue(Effect.fail(new HttpError(401, 'Invalid credentials')))
      const store = useAuthStore()

      await expect(store.login('admin', 'wrong')).rejects.toBeTruthy()

      expect(store.isAuthenticated).toBe(false)
      expect(store.error).toBe('Invalid credentials')
      expect(store.loading).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears isAuthenticated', async () => {
      const store = useAuthStore()
      await store.login('admin', 'secret')
      expect(store.isAuthenticated).toBe(true)

      await store.logout()

      expect(store.isAuthenticated).toBe(false)
    })

    it('clears isAuthenticated even when the request fails', async () => {
      holders.logoutImpl = () => Effect.fail(new NetworkError('offline'))
      const store = useAuthStore()
      store.isAuthenticated = true

      await store.logout()

      expect(store.isAuthenticated).toBe(false)
    })
  })
})
