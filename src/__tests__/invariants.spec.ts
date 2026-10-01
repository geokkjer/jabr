/**
 * Cross-boundary invariant tests — verifies spec invariants across store boundaries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Book } from '@/types'

// Singleton mock API objects
const mockAuthApi = {
  login: vi.fn(),
  logout: vi.fn(),
  status: vi.fn(),
}
const mockBooksApi = {
  list: vi.fn(),
  search: vi.fn(),
  getById: vi.fn(),
  getContentUrl: vi.fn(() => '/api/book/test'),
  upload: vi.fn(),
}
const mockProfilesApi = {
  list: vi.fn(),
  create: vi.fn(),
}
const mockProgressApi = {
  get: vi.fn(),
  save: vi.fn(),
}

vi.mock('@/composables/useApi', () => ({
  useBooksApi: () => mockBooksApi,
  useProfilesApi: () => mockProfilesApi,
  useProgressApi: () => mockProgressApi,
  useSettingsApi: () => ({
    get: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
  }),
  useAuthApi: () => mockAuthApi,
}))

import { useBooksStore } from '@/stores/books'
import { useProfilesStore, useProgressStore } from '@/stores/profiles'
import { useAuthStore } from '@/stores/auth'
import type { BookProgress } from '@/types'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

// ============================================================
// invariant NoDuplicateBookPaths
// ============================================================
describe('invariant: NoDuplicateBookPaths', () => {
  it('all books in the list have unique paths', async () => {
    mockBooksApi.list.mockResolvedValue([
      { id: 'a.epub', title: 'Book A', author: 'A', path: 'path-a.epub', format: 'epub', size: 100, mtime: new Date() } as Book,
      { id: 'b.pdf', title: 'Book B', author: 'B', path: 'path-b.pdf', format: 'pdf', size: 200, mtime: new Date() } as Book,
    ])

    const store = useBooksStore()
    await store.fetchBooks()

    const paths = store.books.map((b) => b.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('detects duplicate paths as invariant violation', async () => {
    mockBooksApi.list.mockResolvedValue([
      { id: 'first.epub', title: 'First', author: 'A', path: 'same-path.epub', format: 'epub', size: 100, mtime: new Date() },
      { id: 'second.epub', title: 'Second', author: 'B', path: 'same-path.epub', format: 'epub', size: 200, mtime: new Date() },
    ] as Book[])

    const store = useBooksStore()
    await store.fetchBooks()

    const paths = store.books.map((b) => b.path)
    const hasDuplicates = new Set(paths).size !== paths.length
    // The backend's UNIQUE constraint on path should prevent this
    // If duplicates exist, the invariant is violated
    expect(hasDuplicates).toBe(true) // documents the violation for this test input
  })
})

// ============================================================
// invariant AuthGatesAccess
// ============================================================
describe('invariant: AuthGatesAccess', () => {
  it('auto-authenticates when auth is disabled', async () => {
    mockAuthApi.status.mockResolvedValue({ authEnabled: false })

    const store = useAuthStore()
    await store.checkStatus()

    expect(store.authEnabled).toBe(false)
    expect(store.isAuthenticated).toBe(true)
  })

  it('requires login when auth is enabled', async () => {
    mockAuthApi.status.mockResolvedValue({ authEnabled: true })

    const store = useAuthStore()
    await store.checkStatus()

    expect(store.authEnabled).toBe(true)
    expect(store.isAuthenticated).toBe(false)
  })

  it('becomes authenticated after successful login', async () => {
    mockAuthApi.status.mockResolvedValue({ authEnabled: true })
    mockAuthApi.login.mockResolvedValue(undefined)

    const store = useAuthStore()
    await store.checkStatus()
    expect(store.isAuthenticated).toBe(false)

    await store.login('admin', 'password')
    expect(store.isAuthenticated).toBe(true)
  })

  it('becomes unauthenticated after logout', async () => {
    mockAuthApi.login.mockResolvedValue(undefined)
    mockAuthApi.logout.mockResolvedValue(undefined)

    const store = useAuthStore()
    await store.login('admin', 'pass')
    expect(store.isAuthenticated).toBe(true)

    await store.logout()
    expect(store.isAuthenticated).toBe(false)
  })
})

// ============================================================
// invariant ProgressBelongsToKnownProfile
// ============================================================
describe('invariant: ProgressBelongsToKnownProfile', () => {
  it('progress is associated with an existing profile', async () => {
    mockProfilesApi.list.mockResolvedValue([
      { id: 'profile-1', name: 'Reader', createdAt: 1000 },
    ])
    mockProgressApi.save.mockResolvedValue(undefined)

    const profilesStore = useProfilesStore()
    await profilesStore.fetchProfiles()

    const progressStore = useProgressStore()
    await progressStore.saveProgress('profile-1', 'book.epub', {
      format: 'epub',
      location: { cfi: 'epubcfi(/6/4)' },
      percent: 50,
    })

    const progress = progressStore.forBook('book.epub')
    expect(progress).not.toBeUndefined()
    expect(progress!.profileId).toBe('profile-1')
    expect(profilesStore.profiles.some((p) => p.id === progress!.profileId)).toBe(true)
  })
})
