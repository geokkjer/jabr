import type { Book, Profile, BookProgress, Settings, Result } from '@/types'
import { Result as R } from '@/types'

const BASE = '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
      const err = await res.text()
      return R.err(new Error(`${res.status}: ${err}`))
    }
    const data = await res.json()
    return R.ok(data)
  } catch (e) {
    return R.err(e instanceof Error ? e : new Error(String(e)))
  }
}

export function useBooksApi() {
  async function list(): Promise<Book[]> {
    const res = await fetchJson<Book[]>(`${BASE}/books`)
    if (!res.success) throw res.error
    return res.data
  }

  async function search(query: string): Promise<Book[]> {
    const res = await fetchJson<Book[]>(`${BASE}/books/search?q=${encodeURIComponent(query)}`)
    if (!res.success) throw res.error
    return res.data
  }

  async function getById(id: string): Promise<Book | null> {
    // Books are indexed, so we can get from the index
    const res = await fetchJson<Book[]>(`${BASE}/books`)
    if (!res.success) throw res.error
    return res.data.find((b) => b.id === id) || null
  }

  function getContentUrl(bookId: string): string {
    return `${BASE}/book/${encodeURIComponent(bookId)}`
  }

  async function upload(file: File): Promise<{ ok: boolean; id: string }> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetchJson<{ ok: boolean; id: string }>(`${BASE}/upload`, {
      method: 'POST',
      body: form,
    })
    if (!res.success) throw res.error
    return res.data
  }

  return { list, search, getById, getContentUrl, upload }
}

export function useProfilesApi() {
  async function list(): Promise<Profile[]> {
    const res = await fetchJson<Profile[]>(`${BASE}/profiles`)
    if (!res.success) throw res.error
    return res.data
  }

  async function create(name: string): Promise<Profile> {
    const res = await fetchJson<Profile>(`${BASE}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.success) throw res.error
    return res.data
  }

  return { list, create }
}

export function useProgressApi() {
  async function get(profileId: string, bookId: string): Promise<BookProgress | null> {
    const res = await fetchJson<BookProgress>(
      `${BASE}/progress/${encodeURIComponent(bookId)}?profileId=${encodeURIComponent(profileId)}`
    )
    if (!res.success) {
      if (res.error.message.includes('404')) return null
      throw res.error
    }
    return res.data
  }

  async function save(
    profileId: string,
    bookId: string,
    data: { format: string; location: Record<string, unknown>; percent: number }
  ): Promise<void> {
    const res = await fetchJson<{ ok: boolean }>(`${BASE}/progress/${encodeURIComponent(bookId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, ...data }),
    })
    if (!res.success) throw res.error
  }

  return { get, save }
}

export function useSettingsApi() {
  async function get(): Promise<Settings> {
    const res = await fetchJson<Settings>(`${BASE}/settings`)
    if (!res.success) throw res.error
    return res.data
  }

  async function save(settings: Partial<Settings>): Promise<void> {
    const res = await fetchJson<{ ok: boolean }>(`${BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!res.success) throw res.error
  }

  async function reset(): Promise<void> {
    const res = await fetchJson<{ ok: boolean }>(`${BASE}/settings`, { method: 'DELETE' })
    if (!res.success) throw res.error
  }

  return { get, save, reset }
}

export function useAuthApi() {
  async function login(username: string, password: string): Promise<void> {
    const res = await fetchJson<{ ok: boolean }>(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.success) throw res.error
  }

  async function logout(): Promise<void> {
    const res = await fetchJson<{ ok: boolean }>(`${BASE}/login`, { method: 'DELETE' })
    if (!res.success) throw res.error
  }

  async function status(): Promise<{ authEnabled: boolean }> {
    const res = await fetchJson<{ authEnabled: boolean }>(`${BASE}/login/status`)
    if (!res.success) throw res.error
    return res.data
  }

  return { login, logout, status }
}
