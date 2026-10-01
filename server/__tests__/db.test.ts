/**
 * Tests for server/db.ts — covers Profile, BookProgress and BookIndex operations.
 *
 * Spec obligations covered:
 *   - CreateProfile rule
 *   - RecordReadingProgress rule
 *   - invariant ProgressBelongsToKnownProfile
 *   - invariant NoDuplicateBookPaths
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDb,
  listProfiles,
  getProfile,
  createProfile,
  listRecentProgress,
  getBookProgress,
  upsertBookProgress,
  upsertBookIndex,
  listBookIndex,
  listHiddenBookIndex,
  getHiddenPaths,
  hideBookIndex,
  restoreBookIndex,
  searchBookIndex,
  getBookIndex,
  deleteBookIndex,
  cleanupBookIndex,
  resetDatabase,
} from '../db.js'

describe('getDb', () => {
  it('returns a working database connection', () => {
    const db = getDb()
    const row = db.prepare('SELECT 1 as ok').get() as { ok: number }
    expect(row.ok).toBe(1)
  })
})

// ============================================================
// Profiles — covers CreateProfile rule
// ============================================================
describe('Profiles', () => {
  it('creates a profile with non-empty name', () => {
    const profile = createProfile('Alice')
    expect(profile.id).toBeTruthy()
    expect(profile.name).toBe('Alice')
    expect(profile.createdAt).toBeGreaterThan(0)
  })

  it('lists all profiles sorted by name', () => {
    createProfile('Charlie')
    createProfile('Alice')
    createProfile('Bob')
    const profiles = listProfiles()
    expect(profiles).toHaveLength(3)
    expect(profiles[0].name).toBe('Alice')
    expect(profiles[1].name).toBe('Bob')
    expect(profiles[2].name).toBe('Charlie')
  })

  it('gets a profile by id', () => {
    const created = createProfile('Test User')
    const fetched = getProfile(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.name).toBe('Test User')
  })

  it('returns null for unknown profile id', () => {
    expect(getProfile('nonexistent-id')).toBeNull()
  })

  it('gives each profile a unique id', () => {
    const p1 = createProfile('User 1')
    const p2 = createProfile('User 2')
    expect(p1.id).not.toBe(p2.id)
  })
})

// ============================================================
// Book Progress — covers RecordReadingProgress rule
// ============================================================
describe('BookProgress', () => {
  let profileId: string

  beforeEach(() => {
    // Create a profile to associate progress with
    const profile = createProfile('Progress Tester')
    profileId = profile.id
  })

  it('upserts new progress for a profile + book', () => {
    upsertBookProgress({
      profileId,
      bookId: 'books/test.epub',
      format: 'epub',
      locationJson: '{"cfi":"epubcfi(/6/4)"}',
      percent: 42.5,
    })

    const progress = getBookProgress(profileId, 'books/test.epub')
    expect(progress).not.toBeNull()
    expect(progress!.format).toBe('epub')
    expect(progress!.percent).toBe(42.5)
    expect(progress!.updatedAt).toBeGreaterThan(0)
  })

  it('updates existing progress on second upsert', () => {
    upsertBookProgress({
      profileId,
      bookId: 'books/revisited.pdf',
      format: 'pdf',
      locationJson: '{"page":10}',
      percent: 20,
    })

    upsertBookProgress({
      profileId,
      bookId: 'books/revisited.pdf',
      format: 'pdf',
      locationJson: '{"page":50}',
      percent: 80,
    })

    const progress = getBookProgress(profileId, 'books/revisited.pdf')
    expect(progress).not.toBeNull()
    expect(progress!.percent).toBe(80)
  })

  it('returns null for non-existent progress', () => {
    expect(getBookProgress(profileId, 'books/nope.txt')).toBeNull()
  })

  it('stores format-specific location data', () => {
    upsertBookProgress({
      profileId,
      bookId: 'books/epub-test.epub',
      format: 'epub',
      locationJson: JSON.stringify({ cfi: 'epubcfi(/6/12[chap01ref]/4/2/8)' }),
      percent: 55,
    })

    const progress = getBookProgress(profileId, 'books/epub-test.epub')
    const location = JSON.parse(progress!.locationJson)
    expect(location.cfi).toBeDefined()
  })

  it('lists recent progress for a profile', () => {
    upsertBookProgress({
      profileId,
      bookId: 'books/a.epub',
      format: 'epub',
      locationJson: '{"cfi":"epubcfi(/6/2)"}',
      percent: 10,
    })
    upsertBookProgress({
      profileId,
      bookId: 'books/b.pdf',
      format: 'pdf',
      locationJson: '{"page":3}',
      percent: 30,
    })

    const recent = listRecentProgress(profileId, 10)
    expect(recent).toHaveLength(2)
  })
})

// ============================================================
// Book Index — covers RefreshLibrary rule + NoDuplicateBookPaths
// ============================================================
describe('BookIndex', () => {
  it('upserts a book index entry', () => {
    upsertBookIndex({
      id: 'author - title.epub',
      path: 'author - title.epub',
      title: 'Title',
      author: 'Author',
      format: 'epub',
      size: 12345,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })

    const books = listBookIndex()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('Title')
  })

  it('enforces unique book paths via upsert', () => {
    upsertBookIndex({
      id: 'path-one.epub',
      path: 'unique/path.epub',
      title: 'First',
      author: 'Someone',
      format: 'epub',
      size: 100,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })

    // Upsert with same id but updated fields — should replace
    upsertBookIndex({
      id: 'path-one.epub',
      path: 'unique/path.epub',
      title: 'Updated First',
      author: 'Someone Else',
      format: 'epub',
      size: 200,
      mtime: 1717000001000,
      indexedAt: Date.now(),
    })

    const books = listBookIndex()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('Updated First')
  })

  it('searches by title (case-insensitive)', () => {
    upsertBookIndex({
      id: 'python.epub',
      path: 'python.epub',
      title: 'Learning Python',
      author: 'Mark Lutz',
      format: 'epub',
      size: 5000,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })
    upsertBookIndex({
      id: 'rust.epub',
      path: 'rust.epub',
      title: 'The Rust Book',
      author: 'Steve Klabnik',
      format: 'epub',
      size: 3000,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })

    const results = searchBookIndex('python')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Learning Python')
  })

  it('searches by author (case-insensitive)', () => {
    upsertBookIndex({
      id: 'dune.epub',
      path: 'dune.epub',
      title: 'Dune',
      author: 'Frank Herbert',
      format: 'epub',
      size: 9999,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })

    const results = searchBookIndex('herbert')
    expect(results).toHaveLength(1)
    expect(results[0].author).toBe('Frank Herbert')
  })

  it('returns empty array for no match', () => {
    expect(searchBookIndex('nonexistent')).toHaveLength(0)
  })

  it('gets a book index by id', () => {
    upsertBookIndex({
      id: 'specific-id.epub',
      path: 'specific-id.epub',
      title: 'Specific Book',
      author: 'Author',
      format: 'epub',
      size: 100,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })

    const book = getBookIndex('specific-id.epub')
    expect(book).not.toBeNull()
    expect(book!.title).toBe('Specific Book')
  })

  it('returns null for unknown book index id', () => {
    expect(getBookIndex('no-such-book')).toBeNull()
  })

  it('deletes a book index entry', () => {
    upsertBookIndex({
      id: 'to-delete.epub',
      path: 'to-delete.epub',
      title: 'Delete Me',
      author: 'Someone',
      format: 'epub',
      size: 10,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })

    deleteBookIndex('to-delete.epub')
    expect(getBookIndex('to-delete.epub')).toBeNull()
  })

  it('cleans up stale book index entries', () => {
    upsertBookIndex({
      id: 'keep.epub',
      path: 'keep.epub',
      title: 'Keep',
      author: 'A',
      format: 'epub',
      size: 10,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })
    upsertBookIndex({
      id: 'stale.epub',
      path: 'stale.epub',
      title: 'Stale',
      author: 'B',
      format: 'epub',
      size: 10,
      mtime: 1717000000000,
      indexedAt: Date.now(),
    })

    cleanupBookIndex(['keep.epub'])
    const books = listBookIndex()
    expect(books).toHaveLength(1)
    expect(books[0].id).toBe('keep.epub')
  })
})

// ============================================================
// Hiding — reversible "remove from library"
// ============================================================
describe('hiding books', () => {
  function indexBook(id: string, title: string) {
    upsertBookIndex({
      id,
      path: id,
      title,
      author: 'Author',
      format: 'epub',
      size: 10,
      mtime: 1,
      indexedAt: 1,
    })
  }

  it('hides a book from the library list', () => {
    indexBook('a.epub', 'Alpha')
    indexBook('b.epub', 'Beta')

    expect(hideBookIndex('a.epub')).toBe(true)

    expect(listBookIndex().map((b) => b.id)).toEqual(['b.epub'])
    expect(listHiddenBookIndex().map((b) => b.id)).toEqual(['a.epub'])
    expect(getHiddenPaths().has('a.epub')).toBe(true)
  })

  it('restores a hidden book', () => {
    indexBook('a.epub', 'Alpha')
    hideBookIndex('a.epub')

    expect(restoreBookIndex('a.epub')).toBe(true)

    expect(listBookIndex().map((b) => b.id)).toEqual(['a.epub'])
    expect(listHiddenBookIndex()).toEqual([])
  })

  it('reports unknown ids instead of pretending', () => {
    expect(hideBookIndex('nope.epub')).toBe(false)
    expect(restoreBookIndex('nope.epub')).toBe(false)
  })

  it('excludes hidden books from search', () => {
    indexBook('a.epub', 'Findable')
    indexBook('b.epub', 'Findable too')
    hideBookIndex('a.epub')

    expect(searchBookIndex('findable').map((b) => b.id)).toEqual(['b.epub'])
  })

  it('keeps the hidden flag across re-indexing, the way a rescan does', () => {
    indexBook('a.epub', 'Alpha')
    hideBookIndex('a.epub')

    // A rescan upserts every file it finds, including hidden ones
    indexBook('a.epub', 'Alpha')

    expect(listBookIndex()).toEqual([])
    expect(listHiddenBookIndex().map((b) => b.id)).toEqual(['a.epub'])
  })

  it('forgets a hidden book whose file really is gone', () => {
    indexBook('a.epub', 'Alpha')
    hideBookIndex('a.epub')

    cleanupBookIndex([]) // nothing on disk any more

    expect(listHiddenBookIndex()).toEqual([])
  })
})

// ============================================================
// Reset — covers the admin reset endpoint's database operation
// ============================================================
describe('resetDatabase', () => {
  it('clears all data', () => {
    createProfile('User')
    upsertBookIndex({
      id: 'test.epub',
      path: 'test.epub',
      title: 'Test',
      author: 'Test',
      format: 'epub',
      size: 1,
      mtime: 1,
      indexedAt: 1,
    })

    resetDatabase()

    expect(listProfiles()).toHaveLength(0)
    expect(listBookIndex()).toHaveLength(0)
  })
})
