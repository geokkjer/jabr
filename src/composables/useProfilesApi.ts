import type { Profile } from '@/types'
import { usePostgrest } from './usePostgrest'

export function useProfilesApi() {
  const pg = usePostgrest()

  async function list(): Promise<Profile[]> {
    return pg.get<Profile>('profiles', { order: 'created_at.asc' })
  }

  async function create(name: string): Promise<Profile> {
    return pg.post<Profile>('profiles', { name, created_at: Date.now() })
  }

  return { list, create }
}
