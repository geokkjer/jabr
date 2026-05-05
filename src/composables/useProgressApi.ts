import type { BookProgress } from '@/types'
import { usePostgrest } from './usePostgrest'

export function useProgressApi() {
  const pg = usePostgrest()

  async function get(profileId: string, bookId: string): Promise<BookProgress | null> {
    const results = await pg.get<BookProgress>('book_progress', {
      profile_id: `eq.${profileId}`,
      book_id: `eq.${bookId}`,
      limit: 1,
    })
    return results[0] ?? null
  }

  async function upsert(data: Omit<BookProgress, 'updated_at'> & { updated_at: number }): Promise<void> {
    await pg.upsert('book_progress', data as Record<string, unknown>)
  }

  return { get, upsert }
}
