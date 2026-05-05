const BASE_URL = '/api'

interface QueryParams {
  select?: string
  order?: string
  limit?: number
  offset?: number
  [key: string]: unknown
}

export function usePostgrest() {
  async function get<T>(resource: string, params?: QueryParams): Promise<T[]> {
    const url = new URL(`${BASE_URL}/${resource}`, window.location.origin)
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) url.searchParams.set(k, String(v))
      })
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${res.statusText}`)
    return res.json()
  }

  async function getOne<T>(resource: string, id: string): Promise<T | null> {
    const results = await get<T>(resource, { id: `eq.${id}`, limit: 1 })
    return results[0] ?? null
  }

  async function post<T>(resource: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${BASE_URL}/${resource}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${res.statusText}`)
    return res.json()
  }

  async function patch(
    resource: string,
    filters: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<void> {
    const filterStr = Object.entries(filters)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    const res = await fetch(`${BASE_URL}/${resource}?${filterStr}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${res.statusText}`)
  }

  async function upsert(
    resource: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const res = await fetch(`${BASE_URL}/${resource}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${res.statusText}`)
  }

  async function getBinary(bookId: string, mimeType: string): Promise<ArrayBuffer> {
    const res = await fetch(`${BASE_URL}/rpc/book_content?book_id=eq.${bookId}`, {
      headers: { Accept: mimeType },
    })
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${res.statusText}`)
    return res.arrayBuffer()
  }

  return { get, getOne, post, patch, upsert, getBinary }
}
