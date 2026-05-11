export interface Book {
  id: string
  title: string
  author: string
  path: string
  format: 'pdf' | 'epub' | 'txt' | 'md' | 'unknown'
  size: number
  mtime: Date
}

export interface BookProgress {
  profileId: string
  bookId: string
  format: string
  locationJson: string
  percent: number | null
  updatedAt: number
}

export interface Profile {
  id: string
  name: string
  createdAt: number
}

export interface Settings {
  libraryPath: string | null
  authEnabled: string | null
  username: string | null
  password: string | null
  readerTarget: string | null
  calibreMigrated: string | null
  calibreLibraryPath: string | null
}

export interface MigrateResult {
  dryRun: boolean
  total: number
  copied: number
  skipped: number
  errors: number
  details: Array<{
    action: 'copy' | 'skip' | 'error' | 'dry-run'
    title: string
    author: string
    format: string
    reason?: string
  }>
  errors_list: string[]
}

// Result type for type-safe error handling
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

export const Result = {
  ok: <T>(data: T): Result<T> => ({ success: true, data }),
  err: <T, E = Error>(error: E): Result<T, E> => ({ success: false, error }),
} as const

// Book location discriminated union
export type BookLocation =
  | { format: 'epub'; cfi: string }
  | { format: 'pdf'; page: number }
  | { format: 'text'; position: number }
  | { format: 'unknown'; location: null }

export function parseBookLocation(format: string, location: unknown): BookLocation {
  if (!location || typeof location !== 'object') {
    return { format: 'unknown', location: null }
  }

  const loc = location as Record<string, unknown>

  switch (format) {
    case 'epub':
      return { format: 'epub', cfi: String(loc.cfi ?? '') }
    case 'pdf':
      return { format: 'pdf', page: Number(loc.page ?? 1) }
    case 'txt':
    case 'md':
    case 'text':
      return { format: 'text', position: Number(loc.position ?? 0) }
    default:
      return { format: 'unknown', location: null }
  }
}
