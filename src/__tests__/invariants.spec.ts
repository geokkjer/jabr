/**
 * Cross-boundary invariant tests, aligned with jabr.allium:
 *
 *   invariant NoDuplicateBookPaths       — library entries stay unique
 *   invariant ProgressBelongsToKnownProfile — no progress leaks across profiles
 *
 * Each assertion is written so it fails when the invariant is violated
 * (no "assert the violation exists" placeholders).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { Effect } from 'effect'

import type { Book, BookProgress, Profile } from '@/types'

const holders = vi.hoisted(() => ({
  bookListEffect: undefined as unknown,
  profileListEffect: undefined as unknown,
}))

vi.mock('@/services/api', () => ({
  BookApi: {
    get list() {
      return holders.bookListEffect
    },
    search: vi.fn<(query: string) => Effect.Effect<Book[], unknown>>(),
    getById: vi.fn<(id: string) => Effect.Effect<Book | null, unknown>>(),
    getContentUrl: vi.fn<(id: string) => string>(),
    upload: vi.fn<(file: File) => Effect.Effect<{ ok: boolean; id: string }, unknown>>(),
  },
  ProfileApi: {
    get list() {
      return holders.profileListEffect
    },
    create: vi.fn<(name: string) => Effect.Effect<Profile, unknown>>(),
  },
  ProgressApi: {
    listRecent: vi.fn<typeof ProgressApi.listRecent>(),
    get: vi.fn<typeof ProgressApi.get>(),
    save: vi.fn<typeof ProgressApi.save>(),
  },
}))

import { ProgressApi } from '@/services/api'
import { useBooksStore } from '@/stores/books'
import { useProfilesStore } from '@/stores/profiles'
import { useProgressStore } from '@/stores/progress'

const listRecentMock = vi.mocked(ProgressApi.listRecent)
const saveMock = vi.mocked(ProgressApi.save)

const alice: Profile = { id: 'p-alice', name: 'Alice', createdAt: 1 }
const bob: Profile = { id: 'p-bob', name: 'Bob', createdAt: 2 }

function makeBook(id: string, title: string, path = `${title}.epub`): Book {
  return {
    id,
    title,
    author: 'Author',
    path,
    format: 'epub',
    size: 100,
    mtime: '2024-01-01T00:00:00.000Z',
  }
}

function makeProgress(bookId: string, profileId: string, percent: number, updatedAt: number): BookProgress {
  return {
    profileId,
    bookId,
    format: 'epub',
    locationJson: '{"cfi":"x"}',
    percent,
    updatedAt,
  }
}

describe('invariant: NoDuplicateBookPaths', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    holders.bookListEffect = Effect.succeed([
      makeBook('b1', 'Alpha'),
      makeBook('b2', 'Beta'),
      makeBook('b3', 'Gamma'),
    ])
    holders.profileListEffect = Effect.succeed([alice, bob])
  })

  it('keeps every library path unique', async () => {
    const books = useBooksStore()
    await books.fetchBooks()

    const paths = books.books.map((b) => b.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('never duplicates entries through search and sort', async () => {
    const books = useBooksStore()
    await books.fetchBooks()
    const before = books.books.length

    books.setSearch('a')
    books.setSort('title')
    books.setSort('title')
    books.setOrder('desc')

    expect(books.filteredBooks).toHaveLength(books.books.length)
    expect(books.filteredBooks.length).toBeLessThanOrEqual(before)
    expect(new Set(books.filteredBooks.map((b) => b.id)).size).toBe(books.filteredBooks.length)
  })
})

describe('invariant: ProgressBelongsToKnownProfile', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    holders.profileListEffect = Effect.succeed([alice, bob])
    holders.bookListEffect = Effect.succeed([makeBook('b1', 'Alpha'), makeBook('b2', 'Beta')])
    listRecentMock.mockReturnValue(Effect.succeed([]))
    saveMock.mockReturnValue(Effect.succeed(undefined))
  })

  it('only caches progress rows for the active profile', async () => {
    const profiles = useProfilesStore()
    const progress = useProgressStore()
    await profiles.fetchProfiles()
    const activeId = profiles.activeId

    listRecentMock.mockReturnValue(
      Effect.succeed([makeProgress('b1', activeId, 50, 100)]),
    )

    await progress.fetchAllProgress(activeId)

    const entries = Object.values(progress.progressByBook)
    expect(entries).toHaveLength(1)
    for (const entry of entries) {
      expect(entry.profileId).toBe(activeId)
    }
  })

  it('leaves no foreign progress behind after switching profiles', async () => {
    const profiles = useProfilesStore()
    const progress = useProgressStore()
    await profiles.fetchProfiles()
    expect(profiles.activeId).toBe(alice.id)

    listRecentMock.mockReturnValue(
      Effect.succeed([makeProgress('b1', alice.id, 50, 100)]),
    )
    await progress.fetchAllProgress(alice.id)
    expect(Object.keys(progress.progressByBook)).toEqual(['b1'])

    profiles.setActiveProfile(bob.id)

    // Invariant: Alice's entries must not survive the switch to Bob
    expect(Object.keys(progress.progressByBook)).toHaveLength(0)
    expect(progress.recentlyRead).toHaveLength(0)
  })

  it('scopes a saved entry to the profile that saved it', async () => {
    const progress = useProgressStore()

    await progress.saveProgress(alice.id, 'b1', {
      format: 'epub',
      location: { cfi: 'epubcfi(/6/4)' },
      percent: 42,
    })

    expect(saveMock).toHaveBeenCalledWith(alice.id, 'b1', expect.anything())
    expect(progress.forBook('b1')?.profileId).toBe(alice.id)
    expect(progress.forBook('unknown-book')).toBeUndefined()
  })
})

describe('invariant: recentlyRead is a bounded, ordered view', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('excludes unread books, orders newest first and caps at four', () => {
    const progress = useProgressStore()
    progress.progressByBook = {
      unread: makeProgress('unread', alice.id, 0, 999),
      b1: makeProgress('b1', alice.id, 10, 100),
      b2: makeProgress('b2', alice.id, 20, 500),
      b3: makeProgress('b3', alice.id, 30, 300),
      b4: makeProgress('b4', alice.id, 40, 200),
      b5: makeProgress('b5', alice.id, 50, 400),
    }

    const recent = progress.recentlyRead

    expect(recent).toHaveLength(4)
    expect(recent.map((p) => p.bookId)).toEqual(['b2', 'b5', 'b3', 'b4'])
    expect(recent.every((p) => (p.percent ?? 0) > 0)).toBe(true)
  })
})
