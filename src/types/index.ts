export interface Book {
  id: string
  title: string
  author: string
  format: string
  size: number
  identifiers: Record<string, string>
  mtime: number
  indexed_at: number
}

export interface BookProgress {
  profile_id: string
  book_id: string
  format: string
  location: Record<string, unknown>
  percent: number
  updated_at: number
}

export interface Profile {
  id: string
  name: string
  created_at: number
}
