import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Effect, pipe } from 'effect'
import { AdminApi } from '@/services/api'

export const useAdminStore = defineStore('admin', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Wipes profiles, reading progress and the book index. Irreversible. */
  async function resetDatabase() {
    loading.value = true
    error.value = null

    try {
      await Effect.runPromise(
        pipe(
          AdminApi.reset(),
          Effect.catchAll((err) => {
            error.value = err.message
            return Effect.fail(err)
          }),
        ),
      )
    } finally {
      loading.value = false
    }
  }

  return { loading, error, resetDatabase }
})
