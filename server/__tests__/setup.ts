import { beforeEach } from 'vitest'
import { resetDatabase, getDb } from '../db.js'

beforeEach(() => {
  resetDatabase()
})

// Export a helper to verify DB connectivity
export function verifyDbReady() {
  const db = getDb()
  const row = db.prepare('SELECT 1 as ok').get() as { ok: number }
  return row.ok === 1
}
