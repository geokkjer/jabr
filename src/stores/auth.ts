import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Effect, pipe } from 'effect'
import { AuthApi } from '@/services/api'

export const useAuthStore = defineStore('auth', () => {
  // ── State ──
  const isAuthenticated = ref(false)
  const authEnabled = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  // ── Actions ──
  async function checkStatus(force = false) {
    if (initialized.value && !force) return

    const result = await Effect.runPromise(
      pipe(
        AuthApi.status,
        Effect.catchAll(() => Effect.succeed({ authEnabled: false })),
      ),
    )

    authEnabled.value = result.authEnabled
    if (!result.authEnabled) {
      isAuthenticated.value = true
    }

    initialized.value = true
  }

  async function login(username: string, password: string) {
    loading.value = true
    error.value = null

    try {
      await Effect.runPromise(AuthApi.login(username, password))
      isAuthenticated.value = true
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Login failed'
      error.value = message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await Effect.runPromise(
      pipe(
        AuthApi.logout,
        Effect.catchAll(() => Effect.succeed(undefined)),
      ),
    )
    isAuthenticated.value = false
  }

  return {
    isAuthenticated,
    authEnabled,
    loading,
    error,
    initialized,
    checkStatus,
    login,
    logout,
  }
})
