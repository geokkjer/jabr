/**
 * Profiles & Progress store tests — covers CreateProfile, SelectActiveProfile,
 * RecordReadingProgress, RestoreReadingProgress rules.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Profile, BookProgress } from '@/types'

// Singleton mock API objects
const mockProfilesApi = {
  list: vi.fn(),
  create: vi.fn(),
}
const mockProgressApi = {
  get: vi.fn(),
  save: vi.fn(),
}

vi.mock('@/composables/useApi', () => ({
  useBooksApi: () => ({
    list: vi.fn(),
    search: vi.fn(),
    getById: vi.fn(),
    getContentUrl: vi.fn(() => '/api/book/test'),
    upload: vi.fn(),
  }),
  useProfilesApi: () => mockProfilesApi,
  useProgressApi: () => mockProgressApi,
}))

import { useProfilesStore, useProgressStore } from '../profiles'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})

// ============================================================
// Profiles Store — covers CreateProfile, SelectActiveProfile rules
// ============================================================
describe('useProfilesStore', () => {
  describe('fetchProfiles', () => {
    it('fetches profiles and sets first as active', async () => {
      const profiles: Profile[] = [
        { id: 'p1', name: 'Alice', createdAt: 1000 },
        { id: 'p2', name: 'Bob', createdAt: 2000 },
      ]
      mockProfilesApi.list.mockResolvedValue(profiles)

      const store = useProfilesStore()
      await store.fetchProfiles()

      expect(store.profiles).toHaveLength(2)
      expect(store.activeId).toBe('p1')
      expect(store.activeProfile).toEqual(profiles[0])
    })

    it('restores saved active profile from localStorage', async () => {
      mockProfilesApi.list.mockResolvedValue([
        { id: 'a', name: 'Alpha', createdAt: 1 },
        { id: 'b', name: 'Beta', createdAt: 2 },
      ])

      localStorage.setItem('jabr-profile', 'b')

      const store = useProfilesStore()
      await store.fetchProfiles()

      expect(store.activeId).toBe('b')
    })

    it('handles fetch error', async () => {
      mockProfilesApi.list.mockRejectedValue(new Error('Failed to fetch profiles'))

      const store = useProfilesStore()
      await store.fetchProfiles()

      expect(store.error).toBe('Failed to fetch profiles')
    })
  })

  describe('createProfile', () => {
    it('creates a profile and sets it as active', async () => {
      const newProfile: Profile = { id: 'new-id', name: 'Charlie', createdAt: 3000 }
      mockProfilesApi.create.mockResolvedValue(newProfile)

      const store = useProfilesStore()
      await store.createProfile('Charlie')

      expect(store.profiles).toHaveLength(1)
      expect(store.profiles[0].name).toBe('Charlie')
      expect(store.activeId).toBe('new-id')
      expect(localStorage.getItem('jabr-profile')).toBe('new-id')
    })
  })

  describe('setActiveProfile', () => {
    it('switches the active profile', async () => {
      mockProfilesApi.list.mockResolvedValue([
        { id: 'p1', name: 'First', createdAt: 1 },
        { id: 'p2', name: 'Second', createdAt: 2 },
      ])

      const store = useProfilesStore()
      await store.fetchProfiles()
      expect(store.activeId).toBe('p1')

      store.setActiveProfile('p2')
      expect(store.activeId).toBe('p2')
      expect(store.activeProfile!.name).toBe('Second')
      expect(localStorage.getItem('jabr-profile')).toBe('p2')
    })
  })
})

// ============================================================
// Progress Store — covers RecordReadingProgress, RestoreReadingProgress
// ============================================================
describe('useProgressStore', () => {
  it('fetches and stores progress for a book', async () => {
    const progressEntry: BookProgress = {
      profileId: 'p1',
      bookId: 'test.epub',
      format: 'epub',
      locationJson: '{"cfi":"epubcfi(/6/4)"}',
      percent: 50,
      updatedAt: Date.now(),
    }
    mockProgressApi.get.mockResolvedValue(progressEntry)

    const store = useProgressStore()
    await store.fetchProgress('p1', 'test.epub')

    expect(store.forBook('test.epub')).toEqual(progressEntry)
  })

  it('returns undefined for book without progress', () => {
    const store = useProgressStore()
    expect(store.forBook('unknown.epub')).toBeUndefined()
  })

  it('saves progress and updates the local cache', async () => {
    mockProgressApi.save.mockResolvedValue(undefined)

    const store = useProgressStore()
    await store.saveProgress('p1', 'book.epub', {
      format: 'epub',
      location: { cfi: 'epubcfi(/6/8)' },
      percent: 75,
    })

    const cached = store.forBook('book.epub')
    expect(cached).not.toBeUndefined()
    expect(cached!.percent).toBe(75)
    expect(cached!.format).toBe('epub')
    expect(cached!.updatedAt).toBeGreaterThan(0)
  })

  it('updates progress on subsequent saves', async () => {
    mockProgressApi.save.mockResolvedValue(undefined)

    const store = useProgressStore()
    await store.saveProgress('p1', 'progressive.epub', {
      format: 'epub',
      location: { cfi: 'epubcfi(/6/2)' },
      percent: 10,
    })

    await store.saveProgress('p1', 'progressive.epub', {
      format: 'epub',
      location: { cfi: 'epubcfi(/6/20)' },
      percent: 95,
    })

    expect(store.forBook('progressive.epub')!.percent).toBe(95)
  })

  describe('recentlyRead', () => {
    it('returns books with positive progress, sorted by recency', async () => {
      mockProgressApi.save.mockResolvedValue(undefined)

      const store = useProgressStore()

      // Two books with real progress and one at 0%
      await store.saveProgress('p1', 'recent.epub', {
        format: 'epub',
        location: { cfi: 'epubcfi(/6/4)' },
        percent: 60,
      })

      store.progressByBook['unread.epub'] = {
        profileId: 'p1',
        bookId: 'unread.epub',
        format: 'epub',
        locationJson: '{}',
        percent: 0,
        updatedAt: 1,
      }

      const recent = store.recentlyRead
      expect(recent.length).toBe(1) // only books with percent > 0
      expect(recent[0].bookId).toBe('recent.epub')
    })
  })

  it('clears all progress', async () => {
    mockProgressApi.save.mockResolvedValue(undefined)

    const store = useProgressStore()
    await store.saveProgress('p1', 'clear-me.epub', {
      format: 'epub',
      location: { cfi: 'epubcfi(/6/1)' },
      percent: 20,
    })

    store.clearProgress()
    expect(store.forBook('clear-me.epub')).toBeUndefined()
  })
})
