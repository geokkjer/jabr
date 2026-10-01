/**
 * Profiles store tests — covers CreateProfile, SelectActiveProfile and the
 * per-profile isolation of cached reading progress.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { Effect } from 'effect'

import { HttpError } from '@/services/http-client'
import type { Profile } from '@/types'

// ProfileApi.list is a module-level Effect value, so it needs a mutable holder.
const holders = vi.hoisted(() => ({
  listEffect: undefined as unknown,
}))

vi.mock('@/services/api', () => ({
  ProfileApi: {
    get list() {
      return holders.listEffect
    },
    create: vi.fn<typeof ProfileApi.create>(),
  },
}))

import { ProfileApi } from '@/services/api'
import { useProfilesStore } from '@/stores/profiles'
import { useProgressStore } from '@/stores/progress'

const createMock = vi.mocked(ProfileApi.create)

const alice: Profile = { id: 'p-alice', name: 'Alice', createdAt: 1 }
const bob: Profile = { id: 'p-bob', name: 'Bob', createdAt: 2 }

describe('useProfilesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    holders.listEffect = Effect.succeed([alice, bob])
    createMock.mockReturnValue(Effect.succeed({ id: 'p-new', name: 'New', createdAt: 3 }))
  })

  describe('fetchProfiles', () => {
    it('populates profiles and restores the saved active profile', async () => {
      localStorage.setItem('jabr-profile', bob.id)
      const store = useProfilesStore()

      await store.fetchProfiles()

      expect(store.profiles).toHaveLength(2)
      expect(store.activeId).toBe(bob.id)
      expect(store.activeProfile?.name).toBe('Bob')
      expect(store.loading).toBe(false)
    })

    it('falls back to the first profile when nothing is saved', async () => {
      const store = useProfilesStore()

      await store.fetchProfiles()

      expect(store.activeId).toBe(alice.id)
    })

    it('ignores a saved id that no longer exists', async () => {
      localStorage.setItem('jabr-profile', 'p-deleted')
      const store = useProfilesStore()

      await store.fetchProfiles()

      expect(store.activeId).toBe(alice.id)
    })

    it('records the error and returns an empty list on failure', async () => {
      holders.listEffect = Effect.fail(new HttpError(500, 'db down'))
      const store = useProfilesStore()

      await store.fetchProfiles()

      expect(store.profiles).toEqual([])
      expect(store.error).toBe('db down')
      expect(store.loading).toBe(false)
    })
  })

  describe('createProfile', () => {
    it('adds, activates and persists the new profile', async () => {
      const store = useProfilesStore()
      await store.fetchProfiles()

      await store.createProfile('New')

      expect(store.profiles.map((p) => p.name)).toEqual(['Alice', 'Bob', 'New'])
      expect(store.activeId).toBe('p-new')
      expect(localStorage.getItem('jabr-profile')).toBe('p-new')
    })
  })

  describe('setActiveProfile', () => {
    it('persists the selection and clears the previous profile progress', async () => {
      const store = useProfilesStore()
      const progressStore = useProgressStore()
      await store.fetchProfiles()

      // Seed a progress entry belonging to Alice
      progressStore.progressByBook['b1'] = {
        profileId: alice.id,
        bookId: 'b1',
        format: 'epub',
        locationJson: '{"cfi":"x"}',
        percent: 40,
        updatedAt: 10,
      }
      const clearSpy = vi.spyOn(progressStore, 'clearProgress')

      store.setActiveProfile(bob.id)

      expect(store.activeId).toBe(bob.id)
      expect(localStorage.getItem('jabr-profile')).toBe(bob.id)
      expect(clearSpy).toHaveBeenCalledTimes(1)
      // Invariant: no progress entry may survive a profile switch
      expect(Object.keys(progressStore.progressByBook)).toHaveLength(0)
    })

    it('is a no-op when re-selecting the active profile', async () => {
      const store = useProfilesStore()
      const progressStore = useProgressStore()
      await store.fetchProfiles()
      const clearSpy = vi.spyOn(progressStore, 'clearProgress')

      store.setActiveProfile(alice.id)

      expect(clearSpy).not.toHaveBeenCalled()
    })
  })
})
