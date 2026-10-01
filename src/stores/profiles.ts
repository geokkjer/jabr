import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Effect, pipe } from 'effect'
import { ProfileApi } from '@/services/api'
import { useProgressStore } from '@/stores/progress'
import type { Profile } from '@/types'

export const useProfilesStore = defineStore('profiles', () => {
  // ── State ──
  const profiles = ref<Profile[]>([])
  const activeId = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ── Getter ──
  const activeProfile = computed(() =>
    profiles.value.find((p) => p.id === activeId.value),
  )

  // ── Helpers ──
  function persistActiveProfile(id: string) {
    localStorage.setItem('jabr-profile', id)
  }

  function restoreActiveProfile() {
    const saved = localStorage.getItem('jabr-profile')
    if (saved && profiles.value.some((p) => p.id === saved)) {
      activeId.value = saved
    } else if (!activeId.value) {
      const first = profiles.value[0]
      if (first) activeId.value = first.id
    }
  }

  // ── Actions ──
  async function fetchProfiles() {
    loading.value = true
    error.value = null

    const result = await Effect.runPromise(
      pipe(
        ProfileApi.list,
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.succeed([])
        }),
      ),
    )
    profiles.value = result as Profile[]
    restoreActiveProfile()
    loading.value = false
  }

  /**
   * Guarantees at least one profile exists — the server creates a starter
   * profile ("Me") on a fresh install — and makes it active. Safe to call on
   * every page load: the endpoint is idempotent.
   */
  async function ensureDefaultProfile() {
    loading.value = true
    error.value = null

    const result = await Effect.runPromise(
      pipe(
        ProfileApi.ensureDefault(),
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.succeed([])
        }),
      ),
    )
    profiles.value = result as Profile[]
    restoreActiveProfile()
    loading.value = false
  }

  async function createProfile(name: string) {
    const created = (await Effect.runPromise(ProfileApi.create(name))) as Profile
    profiles.value.push(created)
    activeId.value = created.id
    persistActiveProfile(created.id)
  }

  async function renameProfile(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return

    const updated = (await Effect.runPromise(ProfileApi.rename(id, trimmed))) as Profile
    const existing = profiles.value.find((p) => p.id === id)
    if (existing) existing.name = updated.name
  }

  function setActiveProfile(id: string) {
    if (id === activeId.value) return
    activeId.value = id
    persistActiveProfile(id)
    // Progress is per-profile — drop the previous profile's cached entries
    // so BookCard bars and "currently reading" can't leak across profiles.
    useProgressStore().clearProgress()
  }

  return {
    profiles,
    activeId,
    loading,
    error,
    activeProfile,
    fetchProfiles,
    ensureDefaultProfile,
    createProfile,
    renameProfile,
    setActiveProfile,
  }
})
