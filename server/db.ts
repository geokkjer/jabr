import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DB_PATH } from './config.js'

let dbSingleton: Database.Database | undefined

export function closeDb(): void {
  if (dbSingleton) {
    dbSingleton.close()
    dbSingleton = undefined
  }
}

export interface Profile {
  id: string
  name: string
  createdAt: number
}

export interface BookProgress {
  profileId: string
  bookId: string
  format: string
  locationJson: string
  percent: number | null
  updatedAt: number
}

export interface BookIndex {
  id: string
  path: string
  title: string
  author: string
  format: string
  size: number
  mtime: number
  indexedAt: number
  identifiers?: Record<string, string>
}

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton

  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  const schemaSQL = `
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_progress (
      profile_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      format TEXT NOT NULL,
      location_json TEXT NOT NULL,
      percent REAL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, book_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_book_progress_book_id ON book_progress(book_id);

    CREATE TABLE IF NOT EXISTS book_index (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      format TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL,
      identifiers TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_book_index_path ON book_index(path);
    CREATE INDEX IF NOT EXISTS idx_book_index_title ON book_index(title);
    CREATE INDEX IF NOT EXISTS idx_book_index_author ON book_index(author);
    CREATE INDEX IF NOT EXISTS idx_book_index_mtime ON book_index(mtime);
  `

  db.exec(schemaSQL)
  dbSingleton = db
  return db
}

// Profiles
export function listProfiles(): Profile[] {
  const db = getDb()
  return db
    .prepare('SELECT id, name, created_at as createdAt FROM profiles ORDER BY name ASC')
    .all() as Profile[]
}

export function getProfile(id: string): Profile | null {
  const db = getDb()
  const row = db
    .prepare('SELECT id, name, created_at as createdAt FROM profiles WHERE id = ?')
    .get(id) as Profile | undefined
  return row ?? null
}

export function createProfile(name: string): Profile {
  const db = getDb()
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  db.prepare('INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)').run(
    id,
    name,
    createdAt
  )
  return { id, name, createdAt }
}

export function renameProfile(id: string, name: string): Profile | null {
  const db = getDb()
  const result = db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, id)
  if (result.changes === 0) return null
  return getProfile(id)
}

// Book Progress
export function listRecentProgress(profileId: string, limit: number): BookProgress[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT profile_id as profileId, book_id as bookId, format, location_json as locationJson, percent, updated_at as updatedAt FROM book_progress WHERE profile_id = ? ORDER BY updated_at DESC LIMIT ?'
    )
    .all(profileId, limit) as BookProgress[]
}

/** All progress rows across profiles (for backup export) */
export function listAllProgress(limit: number): BookProgress[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT profile_id as profileId, book_id as bookId, format, location_json as locationJson, percent, updated_at as updatedAt FROM book_progress ORDER BY updated_at DESC LIMIT ?'
    )
    .all(limit) as BookProgress[]
}

export function getBookProgress(profileId: string, bookId: string): BookProgress | null {
  const db = getDb()
  const row = db
    .prepare(
      'SELECT profile_id as profileId, book_id as bookId, format, location_json as locationJson, percent, updated_at as updatedAt FROM book_progress WHERE profile_id = ? AND book_id = ?'
    )
    .get(profileId, bookId) as BookProgress | undefined
  return row ?? null
}

export function upsertBookProgress(progress: Omit<BookProgress, 'updatedAt'>): void {
  const db = getDb()
  const updatedAt = Date.now()
  db.prepare(
    'INSERT INTO book_progress (profile_id, book_id, format, location_json, percent, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(profile_id, book_id) DO UPDATE SET location_json = excluded.location_json, percent = excluded.percent, updated_at = excluded.updated_at'
  ).run(
    progress.profileId,
    progress.bookId,
    progress.format,
    progress.locationJson,
    progress.percent,
    updatedAt
  )
}

// Book Index
export function upsertBookIndex(book: BookIndex): void {
  const db = getDb()
  const identifiersJson = book.identifiers ? JSON.stringify(book.identifiers) : null
  db.prepare(
    'INSERT INTO book_index (id, path, title, author, format, size, mtime, indexed_at, identifiers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET path = excluded.path, title = excluded.title, author = excluded.author, format = excluded.format, size = excluded.size, mtime = excluded.mtime, indexed_at = excluded.indexed_at, identifiers = excluded.identifiers'
  ).run(
    book.id,
    book.path,
    book.title,
    book.author,
    book.format,
    book.size,
    book.mtime,
    book.indexedAt,
    identifiersJson
  )
}

export function listBookIndex(): BookIndex[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT id, path, title, author, format, size, mtime, indexed_at as indexedAt, identifiers FROM book_index ORDER BY title ASC'
    )
    .all() as BookIndex[]
}

export function searchBookIndex(query: string): BookIndex[] {
  const db = getDb()
  const searchQuery = `%${query.toLowerCase()}%`
  return db
    .prepare(
      'SELECT id, path, title, author, format, size, mtime, indexed_at as indexedAt, identifiers FROM book_index WHERE LOWER(title) LIKE ? OR LOWER(author) LIKE ? ORDER BY title ASC'
    )
    .all(searchQuery, searchQuery) as BookIndex[]
}

export function getBookIndex(id: string): BookIndex | null {
  const db = getDb()
  const row = db
    .prepare(
      'SELECT id, path, title, author, format, size, mtime, indexed_at as indexedAt, identifiers FROM book_index WHERE id = ?'
    )
    .get(id) as BookIndex | undefined
  return row ?? null
}

export function deleteBookIndex(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM book_index WHERE id = ?').run(id)
}

export function cleanupBookIndex(currentPaths: string[]): void {
  const db = getDb()
  if (currentPaths.length === 0) {
    db.prepare('DELETE FROM book_index').run()
    return
  }
  const placeholders = currentPaths.map(() => '?').join(',')
  db.prepare(`DELETE FROM book_index WHERE path NOT IN (${placeholders})`).run(...currentPaths)
}

export function resetDatabase(): void {
  const db = getDb()
  const tables = ['profiles', 'book_progress', 'book_index']
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
  db.prepare('VACUUM').run()
}
