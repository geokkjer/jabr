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
    ensureDefault: vi.fn<typeof ProfileApi.ensureDefault>(),
    create: vi.fn<typeof ProfileApi.create>(),
    rename: vi.fn<typeof ProfileApi.rename>(),
  },
}))

import { ProfileApi } from '@/services/api'
import { useProfilesStore } from '@/stores/profiles'
import { useProgressStore } from '@/stores/progress'

const createMock = vi.mocked(ProfileApi.create)
const ensureDefaultMock = vi.mocked(ProfileApi.ensureDefault)
const renameMock = vi.mocked(ProfileApi.rename)

const alice: Profile = { id: 'p-alice', name: 'Alice', createdAt: 1 }
const bob: Profile = { id: 'p-bob', name: 'Bob', createdAt: 2 }

describe('useProfilesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    holders.listEffect = Effect.succeed([alice, bob])
    createMock.mockReturnValue(Effect.succeed({ id: 'p-new', name: 'New', createdAt: 3 }))
    ensureDefaultMock.mockReturnValue(Effect.succeed([alice, bob]))
    renameMock.mockReturnValue(Effect.succeed({ ...alice, name: 'Renamed' }))
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

  describe('ensureDefaultProfile', () => {
    it('uses the starter profile the server returns on a fresh install', async () => {
      const starter: Profile = { id: 'p-me', name: 'Me', createdAt: 1 }
      ensureDefaultMock.mockReturnValue(Effect.succeed([starter]))
      const store = useProfilesStore()

      await store.ensureDefaultProfile()

      expect(store.profiles).toHaveLength(1)
      expect(store.activeId).toBe('p-me')
      expect(store.activeProfile?.name).toBe('Me')
      expect(store.loading).toBe(false)
    })

    it('keeps the saved active profile when one exists', async () => {
      localStorage.setItem('jabr-profile', bob.id)
      const store = useProfilesStore()

      await store.ensureDefaultProfile()

      expect(store.activeId).toBe(bob.id)
    })

    it('records the error and leaves the list empty when the call fails', async () => {
      ensureDefaultMock.mockReturnValue(Effect.fail(new HttpError(500, 'db down')))
      const store = useProfilesStore()

      await store.ensureDefaultProfile()

      expect(store.profiles).toEqual([])
      expect(store.error).toBe('db down')
    })
  })

  describe('renameProfile', () => {
    it('renames the starter profile in place', async () => {
      const store = useProfilesStore()
      await store.fetchProfiles()

      await store.renameProfile(alice.id, 'Geir')

      expect(renameMock).toHaveBeenCalledWith(alice.id, 'Geir')
      expect(store.profiles.find((p) => p.id === alice.id)?.name).toBe('Renamed')
    })

    it('ignores a blank name without calling the API', async () => {
      const store = useProfilesStore()
      await store.fetchProfiles()

      await store.renameProfile(alice.id, '   ')

      expect(renameMock).not.toHaveBeenCalled()
    })
  })
})
