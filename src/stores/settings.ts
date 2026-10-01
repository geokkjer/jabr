import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Effect, pipe } from 'effect'
import { SettingsApi, MigrationApi } from '@/services/api'
import type { Settings, MigrateResult } from '@/types'

const defaultSettings: Settings = {
  libraryPath: null,
  authEnabled: null,
  username: null,
  password: null,
  readerTarget: null,
  calibreMigrated: null,
  calibreLibraryPath: null,
}

export const useSettingsStore = defineStore('settings', () => {
  // ── State ──
  const settings = ref<Settings>({ ...defaultSettings })
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ── Actions ──
  async function fetchSettings() {
    loading.value = true
    error.value = null

    const result = await Effect.runPromise(
      pipe(
        SettingsApi.get,
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.succeed({ ...defaultSettings })
        }),
      ),
    )
    settings.value = result as Settings
    loading.value = false
  }

  async function saveSettings(partial: Partial<Settings>) {
    loading.value = true
    error.value = null

    await Effect.runPromise(
      pipe(
        SettingsApi.save(partial as Record<string, unknown>),
        Effect.tap(() => {
          Object.assign(settings.value, partial)
          return Effect.succeed(undefined)
        }),
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.fail(err)
        }),
      ),
    )

    loading.value = false
  }

  async function migrateFromCalibre(
    libraryPath: string,
    options?: { preferFormat?: string; dryRun?: boolean },
  ): Promise<MigrateResult> {
    const result = await Effect.runPromise(
      pipe(
        MigrationApi.run({ ...options, libraryPath }),
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.fail(err)
        }),
      ),
    )
    return result as MigrateResult
  }

  async function resetDatabase() {
    loading.value = true
    error.value = null

    await Effect.runPromise(
      pipe(
        SettingsApi.reset(),
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.fail(err)
        }),
      ),
    )

    loading.value = false
  }

  return {
    settings,
    loading,
    error,
    fetchSettings,
    saveSettings,
    migrateFromCalibre,
    resetDatabase,
  }
})
