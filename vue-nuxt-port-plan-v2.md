# JABR Vue Port - Revised Architecture Plan v2

> Rebuilding JABR from SvelteKit to Vue 3 + Vite + PostgreSQL + PostgREST
>
> Principles: KISS, YAGNI, start minimal and grow

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Phase 1: Project Foundation](#phase-1-project-foundation)
5. [Phase 2: PostgreSQL Schema](#phase-2-postgresql-schema)
6. [Phase 3: Container Stack](#phase-3-container-stack)
7. [Phase 4: Calibre Migration Script](#phase-4-calibre-migration-script)
8. [Phase 5: Frontend - API Layer](#phase-5-frontend---api-layer)
9. [Phase 6: Frontend - Pinia Stores](#phase-6-frontend---pinia-stores)
10. [Phase 7: Frontend - Components](#phase-7-frontend---components)
11. [Phase 8: Frontend - Pages](#phase-8-frontend---pages)
12. [Phase 9: Build & Deploy](#phase-9-build--deploy)
13. [Quick Start](#quick-start)
14. [PostgREST API Reference](#postgrest-api-reference)
15. [Key Vue Concepts to Learn](#key-vue-concepts-to-learn)
16. [Comparison: SvelteKit Original → Vue Port](#comparison-sveltekit-original--vue-port)

---

## Architecture Overview

```
┌──────────────────────────────────────────────┐
│  Vue 3 SPA (Vite)                            │
│  Port 5173 (dev)                             │
│                                              │
│  Vue Router · Pinia · Tailwind CSS 4         │
│  epubjs · pdfjs-dist                         │
└──────────┬────────────────────────┬──────────┘
           │                 Vite proxy /api/* → PostgREST
           │                 (dev: vite.config.ts proxy)
           │
           ▼
┌──────────────────────────────────────────────┐
│  PostgREST (podman)                          │
│  Port 3001                                   │
│                                              │
│  Auto-generates REST API from PostgreSQL:    │
│  GET    /books                               │
│  GET    /books?id=eq.xxx                     │
│  POST   /books                               │
│  PATCH  /books?id=eq.xxx                     │
│  DELETE /books?id=eq.xxx                     │
│  GET    /rpc/book_content (BYTEA streaming)  │
│  GET    /profiles                            │
│  POST   /profiles                            │
│  GET    /book_progress                       │
│  PATCH  /book_progress                       │
│  GET    /settings                            │
│  POST   /settings                            │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  PostgreSQL 16 (podman)                      │
│  Port 5432                                   │
│                                              │
│  Schema: api                                 │
│                                              │
│  Tables:                                     │
│  ┌─────────────────────────────────────┐     │
│  │ api.books                           │     │
│  │ ├── id         UUID  PK             │     │
│  │ ├── title      TEXT                 │     │
│  │ ├── author     TEXT                 │     │
│  │ ├── format     TEXT  (epub/pdf/...) │     │
│  │ ├── content    BYTEA                │     │
│  │ ├── size       BIGINT               │     │
│  │ ├── identifiers JSONB               │     │
│  │ ├── mtime      BIGINT               │     │
│  │ └── indexed_at BIGINT               │     │
│  ├─────────────────────────────────────┤     │
│  │ api.profiles                        │     │
│  │ ├── id         UUID  PK             │     │
│  │ ├── name       TEXT                 │     │
│  │ └── created_at BIGINT               │     │
│  ├─────────────────────────────────────┤     │
│  │ api.book_progress                   │     │
│  │ ├── profile_id UUID  PK/FK         │     │
│  │ ├── book_id    UUID  PK/FK         │     │
│  │ ├── format     TEXT                 │     │
│  │ ├── location   JSONB                │     │
│  │ ├── percent    REAL                 │     │
│  │ └── updated_at BIGINT               │     │
│  └─────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

---

## Technology Stack

| Component | Choice | Why |
|-----------|--------|-----|
| **Frontend Framework** | Vue 3.5+ (Composition API, `<script setup>`) | Latest Vue, minimal boilerplate |
| **Build Tool** | Vite 6 | Fast dev server, native ESM |
| **Routing** | Vue Router 4 | Official, file-based-like with history mode |
| **State Management** | Pinia | Official Vue state management, modular stores |
| **Styling** | Tailwind CSS 4 | Same as original, utility-first, `@theme` directive |
| **Components** | Custom-built (KISS) | Only 3-4 simple components needed, no UI library overhead |
| **API Client** | Raw `fetch` + light wrapper | PostgREST is just HTTP, keep it simple |
| **Book Readers** | epubjs + pdfjs-dist | Same as original |
| **Database** | PostgreSQL 16 (podman) | BYTEA for book content, all in one place |
| **API Server** | PostgREST (podman) | Auto-generated REST from DB schema, zero CRUD code |
| **Migration Tool** | Node.js CLI script (runs ad-hoc) | Reads Calibre metadata.db, writes to PostgreSQL via `pg` |
| **Container Runtime** | podman + podman-compose | Drop-in Docker replacement, daemonless |

---

## Project Structure

```
jabr/
├── compose.yml                  # podman-compose: PostgreSQL + PostgREST
├── postgrest.conf               # PostgREST configuration
├── db/
│   └── init.sql                 # PostgreSQL schema + indexes + RPC functions
├── scripts/
│   └── migrate-calibre.ts       # Calibre → PostgreSQL migration (Node CLI)
├── src/
│   ├── main.ts                  # Vue app entry (createApp + router + pinia)
│   ├── App.vue                  # Root component with <router-view>
│   ├── router/
│   │   └── index.ts             # Vue Router config (3 routes)
│   ├── stores/
│   │   ├── books.ts             # Pinia: book list, search, sort
│   │   ├── profiles.ts          # Pinia: reading profiles
│   │   └── progress.ts          # Pinia: reading progress per book
│   ├── composables/
│   │   └── usePostgrest.ts      # PostgREST client wrapper (thin fetch wrapper)
│   ├── components/
│   │   ├── BookCard.vue         # Book grid card with progress indicator
│   │   ├── SearchBar.vue        # Search input
│   │   ├── CurrentlyReading.vue # Active reading widget
│   │   ├── SortControls.vue     # Sort by title/author/size
│   │   └── BookReader.vue       # EPUB/PDF/TEXT reader
│   ├── pages/
│   │   ├── LibraryPage.vue      # /  — book grid home
│   │   ├── ReaderPage.vue       # /read/:id — book reader
│   │   └── SettingsPage.vue     # /settings — profiles + info
│   ├── styles/
│   │   └── main.css             # Tailwind v4 + custom theme
│   └── types/
│       └── index.ts             # TypeScript interfaces
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

### Total component count: 5 components + 3 pages + 3 stores = minimal surface area

---

## Phase 1: Project Foundation

### 1.1 Scaffold

```bash
pnpm create vite jabr --template vue-ts
cd jabr
pnpm install
```

### 1.2 Install Dependencies

```bash
# Vue ecosystem
pnpm add vue-router@4 pinia

# Styling
pnpm add -D tailwindcss @tailwindcss/vite

# Book readers
pnpm add epubjs pdfjs-dist

# Database client (for migration script only)
pnpm add -D pg @types/pg better-sqlite3

# Testing (lightweight)
pnpm add -D vitest @vue/test-utils happy-dom

# Code quality
pnpm add -D typescript
```

### 1.3 Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

### 1.4 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

### 1.5 Tailwind CSS 4 Theme (Porting Original)

```css
/* src/styles/main.css */
@import 'tailwindcss';

@theme {
  /* Fonts */
  --font-display: 'Syne', sans-serif;
  --font-sans: 'Outfit', sans-serif;
  --font-serif: 'Libre Baskerville', serif;

  /* Coffee & Parchment color palette */
  --color-parchment: #fdfbf7;
  --color-card: #ffffff;
  --color-forest: #2d4a3e;
  --color-leather: #8c5e3c;
  --color-clay: #a65d57;
  --color-ocher: #d98324;
  --color-coffee: #2b2118;
  --color-shadow: #2b2118;
  --color-sage: #8da399;
}

@custom-variant dark (&:where(.dark, .dark *));

@media (prefers-color-scheme: dark) {
  :root {
    --color-parchment: #1a1614;
    --color-card: #26201d;
    --color-coffee: #e8e4dd;
    --color-forest: #4a6b5d;
    --color-leather: #b08d74;
    --color-clay: #c48b86;
    --color-ocher: #e6a863;
    --color-shadow: #e6a863;
    --color-sage: #5c6b63;
  }
}

body {
  background-color: var(--color-parchment);
  color: var(--color-coffee);
  font-family: var(--font-sans);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display);
}
```

### 1.6 Environment Variables

```bash
# .env
DATABASE_URL=postgres://jabr:jabr@localhost:5432/jabr
PGRST_URL=http://localhost:3001
```

---

## Phase 2: PostgreSQL Schema

### 2.1 Database Schema

```sql
-- db/init.sql
CREATE SCHEMA IF NOT EXISTS api;

-- Domain types for binary content streaming via PostgREST RPC
-- Each maps to a specific MIME type for the Accept header
CREATE DOMAIN "application/epub+zip" AS bytea;
CREATE DOMAIN "application/pdf" AS bytea;
CREATE DOMAIN "text/plain" AS bytea;
CREATE DOMAIN "application/octet-stream" AS bytea;

-- Books table: metadata + content (BYTEA)
CREATE TABLE api.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Unknown',
  format TEXT NOT NULL CHECK (format IN ('epub', 'pdf', 'txt', 'text', 'md', 'markdown')),
  content BYTEA,
  size BIGINT NOT NULL DEFAULT 0,
  identifiers JSONB DEFAULT '{}',
  mtime BIGINT,
  indexed_at BIGINT NOT NULL
);

-- Reading profiles (no auth, just named bookmark profiles)
CREATE TABLE api.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- Per-profile reading progress
CREATE TABLE api.book_progress (
  profile_id UUID NOT NULL REFERENCES api.profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES api.books(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  location JSONB DEFAULT '{}',
  percent REAL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (profile_id, book_id)
);

-- Simple key-value settings
CREATE TABLE api.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Full-text search index on title + author
CREATE INDEX idx_books_fts
  ON api.books USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(author, ''))
  );

-- Grant anon role (no auth required for local app)
CREATE ROLE IF NOT EXISTS anon NOLOGIN;
GRANT USAGE ON SCHEMA api TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA api TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA api TO anon;
```

### 2.2 Binary Content Streaming with PostgREST RPC

PostgREST cannot autodetect BYTEA columns in tables for binary streaming. Instead, we create an RPC function that returns the BYTEA wrapped in a domain type matching the book's format MIME type.

```sql
-- Single RPC function that streams any book content
-- The Accept header determines the Content-Type of the response
CREATE OR REPLACE FUNCTION api.book_content(book_id UUID)
RETURNS bytea  -- PostgREST will use the actual content type from Accept header
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (SELECT content FROM api.books WHERE id = book_id);
END;
$$;

GRANT EXECUTE ON FUNCTION api.book_content TO anon;
```

**Client usage:**
```
// Fetch EPUB content:
GET /rpc/book_content?book_id=eq.abc-123
Accept: application/epub+zip
→ Returns raw EPUB bytes

// Fetch PDF content:
GET /rpc/book_content?book_id=eq.abc-123
Accept: application/pdf
→ Returns raw PDF bytes
```

**How PostgREST handles this:** When the function return type is `bytea` and the client sends an `Accept` header matching one of the registered domains (`application/epub+zip`, `application/pdf`, etc.), PostgREST will stream the binary content directly. If `Accept: application/json` is sent, it returns the bytes as a hex-encoded JSON string.

### 2.3 Default Seed Data

```sql
-- db/seed.sql (optional, run once after init)
INSERT INTO api.profiles (name, created_at)
VALUES ('Default', EXTRACT(EPOCH FROM NOW())::BIGINT);
```

---

## Phase 3: Container Stack

### 3.1 Podman Compose

```yaml
# compose.yml
name: jabr

services:
  postgres:
    image: postgres:16-alpine
    container_name: jabr-postgres
    environment:
      POSTGRES_DB: jabr
      POSTGRES_USER: jabr
      POSTGRES_PASSWORD: jabr
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/01-init.sql:Z
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jabr -d jabr"]
      interval: 5s
      timeout: 5s
      retries: 5

  postgrest:
    image: postgrest/postgrest:v12
    container_name: jabr-postgrest
    ports:
      - "3001:3000"
    environment:
      PGRST_DB_URI: postgres://jabr:jabr@postgres:5432/jabr
      PGRST_DB_SCHEMA: api
      PGRST_DB_ANON_ROLE: anon
      PGRST_OPENAPI_SERVER_PROXY_URI: http://localhost:3001
      PGRST_DB_POOL: "10"
      PGRST_DB_MAX_ROWS: "1000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

### 3.2 PostgREST Config (optional override)

```ini
# postgrest.conf
db-uri = "postgres://jabr:jabr@localhost:5432/jabr"
db-schema = "api"
db-anon-role = "anon"
db-pool = 10
db-max-rows = 1000
openapi-server-proxy-uri = "http://localhost:3001"
```

### 3.3 Running the Stack

```bash
# Start services
podman-compose up -d

# Check health
podman-compose ps
curl http://localhost:3001/health

# View PostgREST auto-generated OpenAPI schema
curl http://localhost:3001/

# Tear down (preserves volume data)
podman-compose down

# Tear down completely (wipes database)
podman-compose down -v
```

---

## Phase 4: Calibre Import/Conversion Script

**Key design decision: Calibre is NOT used at runtime.**

This is a one-time conversion step. You run it once to extract your Calibre library data into PostgreSQL, then the app is fully self-contained. The Vue app never talks to Calibre — it only reads from PostgreSQL via PostgREST. You can archive or delete the Calibre library after conversion.

### 4.1 Approach

The existing script (`src/cli/migrate-calibre.ts`) reads from Calibre's `metadata.db` (SQLite), reads the actual book files from disk, and writes everything into PostgreSQL. We adapt it to:
- Write to PostgreSQL via `pg` client instead of SQLite
- Store book file content directly as BYTEA in the `books.content` column
- Run as a standalone CLI command, then exit

### 4.2 Key Changes from Original

| Original (SvelteKit) | New (Vue + PostgreSQL) |
|---------------------|----------------------|
| `better-sqlite3` (SQLite) | `pg` (PostgreSQL) |
| Copied files to `./books/` directory | Reads file into memory as Buffer → inserts as BYTEA |
| `book_index` table with path | `api.books` table with content column |
| `INSERT OR REPLACE` | `INSERT ... ON CONFLICT (title, format) DO NOTHING` |
| SQLite integer timestamps | PostgreSQL `EXTRACT(EPOCH FROM NOW())` |

### 4.3 Migration Script Structure

```typescript
// scripts/migrate-calibre.ts
import Database from 'better-sqlite3'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

interface CalibreBook {
  id: number
  title: string
  author: string
  path: string       // relative path within Calibre library
  format: string
  size: number
  mtime: Date
  identifiers: Record<string, string>
}

async function main() {
  // Parse CLI args (same as original)
  // --library, -l : path to Calibre library directory
  // --db-url      : PostgreSQL connection string (default: postgres://...)
  // --dry-run     : show plan without executing
  // --help, -h    : usage

  // Step 1: Read Calibre metadata.db
  const calibreDbPath = join(libraryPath, 'metadata.db')
  const books = readCalibreDatabase(calibreDbPath)
  console.log(`Found ${books.length} books`)

  // Step 2: Connect to PostgreSQL
  const pool = new pg.Pool({ connectionString: dbUrl })

  // Step 3: For each book, read file content and insert
  for (const book of books) {
    const filePath = join(libraryPath, `${book.path}.${book.format}`)
    const content = await readFile(filePath)

    await pool.query(`
      INSERT INTO api.books (title, author, format, content, size, identifiers, mtime, indexed_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      ON CONFLICT DO NOTHING
    `, [
      book.title,
      book.author,
      book.format.toLowerCase(),
      content,                                    // Buffer → BYTEA
      book.size,
      JSON.stringify(book.identifiers),
      book.mtime.getTime(),
      Date.now(),
    ])
  }

  await pool.end()
  console.log('Migration complete!')
}

function readCalibreDatabase(dbPath: string): CalibreBook[] {
  // Same as original - reads metadata.db with SQL queries
  // Returns array of CalibreBook
}
```

### 4.4 Running the Migration

```bash
# Ensure PostgreSQL is running first
podman-compose up -d

# Run migration
pnpm tsx scripts/migrate-calibre.ts \
  --library ~/Calibre\ Library \
  --db-url postgres://jabr:jabr@localhost:5432/jabr

# Dry-run first
pnpm tsx scripts/migrate-calibre.ts \
  --library ~/Calibre\ Library \
  --dry-run
```

---

## Phase 5: Frontend - API Layer

### 5.1 PostgREST Client (Thin Fetch Wrapper)

```typescript
// src/composables/usePostgrest.ts
const BASE_URL = '/api'  // Vite proxy rewrites to PostgREST

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
    const results = await get<T>(resource, { [`id`]: `eq.${id}`, limit: 1 })
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

  async function patch(resource: string, filters: Record<string, string>, body: Record<string, unknown>): Promise<void> {
    const filterStr = Object.entries(filters).map(([k, v]) => `${k}=${v}`).join('&')
    const res = await fetch(`${BASE_URL}/${resource}?${filterStr}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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

  return { get, getOne, post, patch, getBinary }
}
```

### 5.2 Books API

```typescript
// src/composables/useBooksApi.ts
import type { Book } from '@/types'

export function useBooksApi() {
  const pg = usePostgrest()

  async function list(params?: {
    search?: string
    sort?: string
    order?: 'asc' | 'desc'
    limit?: number
  }): Promise<Book[]> {
    const query: Record<string, unknown> = {
      select: 'id,title,author,format,size,identifiers,mtime',
      order: `${params?.sort || 'title'}.${params?.order || 'asc'}`,
      limit: params?.limit || 100,
    }

    if (params?.search) {
      query[`or`] = `(title.ilike.*${params.search}*,author.ilike.*${params.search}*)`
    }

    return pg.get<Book>('books', query)
  }

  async function getById(id: string): Promise<Book | null> {
    return pg.getOne<Book>('books', id)
  }

  async function fetchContent(bookId: string, format: string): Promise<ArrayBuffer> {
    const mime = format === 'epub' ? 'application/epub+zip'
      : format === 'pdf' ? 'application/pdf'
      : 'text/plain'
    return pg.getBinary(bookId, mime)
  }

  return { list, getById, fetchContent }
}
```

### 5.3 Progress API

```typescript
// src/composables/useProgressApi.ts
import type { BookProgress } from '@/types'

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

  async function upsert(profileId: string, bookId: string, data: Partial<BookProgress>): Promise<void> {
    await pg.patch('book_progress',
      { profile_id: `eq.${profileId}`, book_id: `eq.${bookId}` },
      data as Record<string, unknown>
    )
  }

  return { get, upsert }
}
```

### 5.4 Profiles API

```typescript
// src/composables/useProfilesApi.ts
import type { Profile } from '@/types'

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
```

---

## Phase 6: Frontend - Pinia Stores

> **Note**: Client-side filtering/sorting. Stores fetch all data once; sorting and search filtering happen in getters. Sort/order/search setters are local-only — the getter recomputes automatically.

### 6.1 Books Store

```typescript
// src/stores/books.ts
import { defineStore } from 'pinia'
import type { Book } from '@/types'
import { useBooksApi } from '@/composables/useBooksApi'

interface BooksState {
  books: Book[]
  loading: boolean
  error: string | null
  search: string
  sort: 'title' | 'author' | 'size' | 'mtime'
  order: 'asc' | 'desc'
}

export const useBooksStore = defineStore('books', {
  state: (): BooksState => ({
    books: [],
    loading: false,
    error: null,
    search: '',
    sort: 'title',
    order: 'asc',
  }),

  getters: {
    filteredBooks(state): Book[] {
      let result = [...state.books]

      if (state.search) {
        const q = state.search.toLowerCase()
        result = result.filter(
          b => b.title.toLowerCase().includes(q)
            || b.author.toLowerCase().includes(q)
        )
      }

      result.sort((a, b) => {
        const aVal = String(a[state.sort] || '').toLowerCase()
        const bVal = String(b[state.sort] || '').toLowerCase()
        const cmp = aVal.localeCompare(bVal)
        return state.order === 'asc' ? cmp : -cmp
      })

      return result
    },

    bookCount(state): number {
      return state.books.length
    },
  },

  actions: {
    async fetchBooks() {
      this.loading = true
      this.error = null
      try {
        const { list } = useBooksApi()
        this.books = await list()
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to fetch books'
      } finally {
        this.loading = false
      }
    },

    setSearch(search: string) {
      this.search = search
    },

    setSort(sort: BooksState['sort']) {
      this.sort = sort
    },

    toggleOrder() {
      this.order = this.order === 'asc' ? 'desc' : 'asc'
    },
  },
})
```

### 6.2 Profiles Store

```typescript
// src/stores/profiles.ts
import { defineStore } from 'pinia'
import type { Profile } from '@/types'
import { useProfilesApi } from '@/composables/useProfilesApi'

export const useProfilesStore = defineStore('profiles', {
  state: () => ({
    profiles: [] as Profile[],
    activeId: '' as string,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    activeProfile(state): Profile | undefined {
      return state.profiles.find(p => p.id === state.activeId)
    },
  },

  actions: {
    async fetchProfiles() {
      this.loading = true
      this.error = null
      try {
        const { list } = useProfilesApi()
        this.profiles = await list()
        this._restoreActiveProfile()
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'Failed to fetch profiles'
      } finally {
        this.loading = false
      }
    },

    async createProfile(name: string) {
      const { create } = useProfilesApi()
      const profile = await create(name)
      this.profiles.push(profile)
      this.activeId = profile.id
      localStorage.setItem('jabr-profile', profile.id)
    },

    setActiveProfile(id: string) {
      this.activeId = id
      localStorage.setItem('jabr-profile', id)
    },

    _restoreActiveProfile() {
      const saved = localStorage.getItem('jabr-profile')
      if (saved && this.profiles.some(p => p.id === saved)) {
        this.activeId = saved
      } else if (!this.activeId) {
        const first = this.profiles[0]
        if (first) this.activeId = first.id
      }
    },
  },
})
```

### 6.3 Progress Store

```typescript
// src/stores/progress.ts
import { defineStore } from 'pinia'
import type { BookProgress } from '@/types'
import { useProgressApi } from '@/composables/useProgressApi'

export const useProgressStore = defineStore('progress', {
  state: () => ({
    progressByBook: {} as Record<string, BookProgress>,
    loading: false,
  }),

  getters: {
    forBook: (state) => (bookId: string): BookProgress | undefined =>
      state.progressByBook[bookId],

    currentlyReading: (state): BookProgress | undefined =>
      Object.values(state.progressByBook).find(
        p => p.percent > 0 && p.percent < 100
      ),

    recentlyRead: (state): BookProgress[] =>
      Object.values(state.progressByBook)
        .filter(p => p.percent > 0)
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5),
  },

  actions: {
    async fetchProgress(profileId: string, bookId: string) {
      this.loading = true
      try {
        const { get } = useProgressApi()
        const progress = await get(profileId, bookId)
        if (progress) {
          this.progressByBook[bookId] = progress
        }
      } finally {
        this.loading = false
      }
    },

    async saveProgress(profileId: string, bookId: string, data: Partial<BookProgress>) {
      const now = Date.now()
      const entry: BookProgress = {
        profile_id: profileId,
        book_id: bookId,
        format: data.format || '',
        location: data.location || {},
        percent: data.percent ?? 0,
        updated_at: now,
      }

      this.progressByBook[bookId] = entry

      const { upsert } = useProgressApi()
      await upsert({
        profile_id: profileId,
        book_id: bookId,
        format: entry.format,
        location: entry.location,
        percent: entry.percent,
        updated_at: now,
      })
    },

    clearProgress() {
      this.progressByBook = {}
    },
  },
})
```

---

## Phase 7: Frontend - Components

> **Note**: Client-side filtering/sorting means SearchBar and SortControls don't trigger server calls. BookReader handles EPUB/PDF/TEXT rendering with progress restoration.

### 7.1 Component Inventory

We build only what we need (KISS + YAGNI):

| Component | Props | Purpose |
|-----------|-------|---------|
| `BookCard.vue` | `book: Book`, `progress?: number` | Grid card for book in library |
| `SearchBar.vue` | `modelValue: string` | Search input (no debounce — client-side) |
| `SortControls.vue` | `sort: string`, `order: 'asc' \| 'desc'` | Sort dropdown + direction toggle |
| `CurrentlyReading.vue` | `book: Book`, `progress: number` | Active book widget |
| `BookReader.vue` | `bookId: string`, `format: string`, `contentUrl: string`, `initialLocation?`, `initialPercent?` | EPUB / PDF / TEXT reader |

### 7.2 BookCard.vue

```vue
<!-- src/components/BookCard.vue -->
<script setup lang="ts">
import type { Book } from '@/types'

interface Props {
  book: Book
  progress?: number | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ click: [book: Book]; read: [book: Book] }>()

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div
    class="rounded-xl border-2 border-coffee/10 bg-card p-4 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
    @click="emit('click', book)"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="font-display font-bold text-lg truncate text-coffee">
          {{ book.title || 'Untitled' }}
        </h3>
        <p class="text-sm text-leather truncate mt-0.5">
          {{ book.author || 'Unknown Author' }}
        </p>
      </div>
      <span class="shrink-0 px-2 py-0.5 text-xs font-bold rounded-md bg-ocher/10 text-ocher uppercase">
        {{ book.format }}
      </span>
    </div>

    <div class="mt-4 flex items-center justify-between text-sm">
      <span class="text-sage">{{ formatSize(book.size) }}</span>
      <button
        v-if="progress"
        class="font-bold text-ocher hover:text-ocher/80 transition-colors"
        @click.stop="emit('read', book)"
      >
        Resume {{ Math.round(progress) }}%
      </button>
      <button
        v-else
        class="font-bold text-forest hover:text-forest/80 transition-colors"
        @click.stop="emit('read', book)"
      >
        Read
      </button>
    </div>

    <div
      v-if="progress"
      class="mt-3 h-1.5 rounded-full bg-sage/20 overflow-hidden"
    >
      <div
        class="h-full rounded-full bg-ocher transition-all duration-300"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>
```

### 7.3 SearchBar.vue

No debounce — client-side filtering is instant, no server calls to throttle. Uses `v-model` directly.

```vue
<!-- src/components/SearchBar.vue -->
<script setup lang="ts">
const modelValue = defineModel<string>({ default: '' })

function clear() {
  modelValue.value = ''
}
</script>

<template>
  <div class="relative">
    <input
      v-model="modelValue"
      type="text"
      placeholder="Search books..."
      class="w-full pl-10 pr-4 py-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee placeholder-sage/60 focus:border-ocher focus:outline-none transition-colors"
    />
    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <button
      v-if="modelValue"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-sage hover:text-coffee transition-colors"
      @click="clear"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
```

### 7.4 SortControls.vue

```vue
<!-- src/components/SortControls.vue -->
<script setup lang="ts">
defineProps<{ sort: string; order: 'asc' | 'desc' }>()
const emit = defineEmits<{ 'update:sort': [v: string]; 'update:order': [v: 'asc' | 'desc'] }>()

const options = [
  { label: 'Title', value: 'title' },
  { label: 'Author', value: 'author' },
  { label: 'Size', value: 'size' },
  { label: 'Date', value: 'mtime' },
]
</script>

<template>
  <div class="flex items-center gap-2">
    <select
      :value="sort"
      class="px-3 py-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee text-sm focus:border-ocher focus:outline-none"
      @change="emit('update:sort', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <button
      class="p-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee hover:border-ocher transition-colors"
      :title="order === 'asc' ? 'Ascending' : 'Descending'"
      @click="emit('update:order', order === 'asc' ? 'desc' : 'asc')"
    >
      <svg v-if="order === 'asc'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
      </svg>
      <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
      </svg>
    </button>
  </div>
</template>
```

### 7.5 CurrentlyReading.vue

```vue
<!-- src/components/CurrentlyReading.vue -->
<script setup lang="ts">
import type { Book } from '@/types'

defineProps<{ book: Book; progress: number }>()
const emit = defineEmits<{ continue: []; stop: [] }>()
</script>

<template>
  <div class="rounded-xl border-2 border-ocher/20 bg-ocher/5 p-4">
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold uppercase tracking-wider text-ocher">Currently Reading</p>
        <h3 class="font-display font-bold text-lg text-coffee truncate mt-0.5">{{ book.title }}</h3>
        <p class="text-sm text-leather truncate">{{ book.author }}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          class="px-4 py-1.5 rounded-xl bg-ocher text-white font-bold text-sm hover:bg-ocher/90 transition-colors"
          @click="emit('continue')"
        >
          Continue
        </button>
        <button
          class="p-1.5 rounded-lg text-sage hover:text-clay transition-colors"
          title="Stop reading"
          @click="emit('stop')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
    <div class="mt-3 h-2 rounded-full bg-ocher/10 overflow-hidden">
      <div
        class="h-full rounded-full bg-ocher transition-all"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>
```

### 7.6 BookReader.vue

The reader component encapsulates EPUB.js and pdfjs-dist rendering logic. It receives book content as a Blob URL and manages reading progress with position restoration.

```vue
<!-- src/components/BookReader.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ePub from 'epubjs'
import * as pdfjsLib from 'pdfjs-dist'

const props = defineProps<{
  bookId: string
  format: string
  contentUrl: string
  initialLocation?: Record<string, unknown> | null
  initialPercent?: number | null
}>()

const emit = defineEmits<{
  progress: [location: Record<string, unknown>, percent: number]
}>()

const loading = ref(true)
const error = ref<string | null>(null)
const container = ref<HTMLDivElement | null>(null)
const pdfContainer = ref<HTMLDivElement | null>(null)

let rendition: any = null
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
let currentPage = 1
let saveTimer: ReturnType<typeof setTimeout>

function scheduleSave(location: Record<string, unknown>, percent: number) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => emit('progress', location, percent), 750)
}

async function initEpub() {
  if (!container.value) return
  const book = ePub(props.contentUrl)
  rendition = book.renderTo(container.value, {
    width: '100%',
    height: '100%',
    flow: 'scrolled-doc',
  })

  const cfi = props.initialLocation?.cfi as string | undefined
  await (cfi ? rendition.display(cfi) : rendition.display())

  rendition.on('relocated', (loc: { start?: { cfi?: string }; percentage?: number }) => {
    const cfi = loc.start?.cfi
    if (cfi) {
      scheduleSave({ cfi }, (loc.percentage ?? 0) * 100)
    }
  })
}

async function initPdf() {
  if (!pdfContainer.value) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
  ).toString()

  const loadingTask = pdfjsLib.getDocument(props.contentUrl)
  pdfDoc = await loadingTask.promise

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.setAttribute('data-page', String(i))
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.className = 'mb-4 shadow-lg'
    await page.render({ canvas, viewport }).promise
    pdfContainer.value.appendChild(canvas)
  }

  const savedPage = props.initialLocation?.page as number | undefined
  if (savedPage && savedPage <= pdfDoc.numPages) {
    const el = pdfContainer.value.querySelector(`[data-page="${savedPage}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'start' })
  }

  pdfContainer.value.addEventListener('scroll', () => {
    if (!pdfContainer.value || !pdfDoc) return
    const els = pdfContainer.value.querySelectorAll('[data-page]')
    const containerTop = pdfContainer.value.getBoundingClientRect().top
    let closest = 1, minDiff = Infinity
    els.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const diff = Math.abs(rect.top - containerTop)
      if (diff < minDiff) {
        minDiff = diff
        closest = parseInt(el.getAttribute('data-page') || '1')
      }
    })
    if (closest !== currentPage) {
      currentPage = closest
      scheduleSave({ page: closest }, (closest / (pdfDoc?.numPages ?? 1)) * 100)
    }
  })
}

onMounted(async () => {
  try {
    loading.value = true
    if (props.format === 'epub') await initEpub()
    else if (props.format === 'pdf') await initPdf()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load reader'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  clearTimeout(saveTimer)
  rendition?.destroy()
  pdfDoc?.destroy()
  URL.revokeObjectURL(props.contentUrl)
})
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center h-full text-sage text-lg">
    Loading reader...
  </div>
  <div v-else-if="error" class="flex items-center justify-center h-full px-8 text-center text-clay">
    {{ error }}
  </div>
  <div v-else-if="format === 'epub'" ref="container" class="w-full h-full" />
  <div
    v-else-if="format === 'pdf'"
    ref="pdfContainer"
    class="w-full h-full overflow-y-auto"
    :style="{ backgroundColor: '#2b2118' }"
  />
  <iframe
    v-else
    :src="contentUrl"
    class="w-full h-full border-0"
  />
</template>
```

---

## Phase 8: Frontend - Pages

> **Note**: Pages use `storeToRefs` + `v-model` bindings for direct store interaction. No debounce or custom event bridges needed — components use `defineModel` and `v-model:xxx`.

### 8.1 Vue Router Configuration

```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import LibraryPage from '@/pages/LibraryPage.vue'

const routes = [
  { path: '/', name: 'library', component: LibraryPage },
  {
    path: '/read/:id',
    name: 'reader',
    component: () => import('@/pages/ReaderPage.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
```

### 8.2 App.vue

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen bg-parchment text-coffee">
    <RouterView />
  </div>
</template>
```

### 8.3 LibraryPage.vue (Home)

```vue
<!-- src/pages/LibraryPage.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { useProgressStore } from '@/stores/progress'
import { useProfilesStore } from '@/stores/profiles'
import { storeToRefs } from 'pinia'
import type { Book } from '@/types'
import BookCard from '@/components/BookCard.vue'
import SearchBar from '@/components/SearchBar.vue'
import SortControls from '@/components/SortControls.vue'

const router = useRouter()
const booksStore = useBooksStore()
const progressStore = useProgressStore()
const profilesStore = useProfilesStore()
const { filteredBooks, loading, error, search, sort, order } = storeToRefs(booksStore)

onMounted(async () => {
  await Promise.all([
    profilesStore.fetchProfiles(),
    booksStore.fetchBooks(),
  ])
})

function openBook(book: Book) {
  router.push(`/read/${book.id}`)
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <h1 class="font-display text-3xl font-bold text-coffee">Library</h1>
      <nav class="flex items-center gap-4">
        <router-link to="/settings" class="text-sage hover:text-ocher transition-colors font-medium">
          Settings
        </router-link>
      </nav>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-4 mb-6">
      <SearchBar v-model="search" class="flex-1 max-w-md" />
      <SortControls v-model:sort="sort" v-model:order="order" />
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 p-4 rounded-xl bg-clay/10 border border-clay/30 text-clay font-medium">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-16 text-sage">Loading...</div>

    <!-- Empty -->
    <div v-else-if="filteredBooks.length === 0" class="text-center py-16">
      <p class="text-sage text-lg">No books found</p>
      <p class="text-sage/60 text-sm mt-1">
        {{ search ? 'Try a different search' : 'Import your books to get started' }}
      </p>
    </div>

    <!-- Book Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <BookCard
        v-for="(book, i) in filteredBooks"
        :key="book.id || i"
        :book="book"
        :progress="progressStore.forBook(book.id)?.percent"
        @click="openBook"
        @read="openBook"
      />
    </div>
  </div>
</template>
```

### 8.4 ReaderPage.vue

```vue
<!-- src/pages/ReaderPage.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBooksApi } from '@/composables/useBooksApi'
import { useProgressStore } from '@/stores/progress'
import { useProfilesStore } from '@/stores/profiles'
import BookReader from '@/components/BookReader.vue'
import type { Book } from '@/types'

const route = useRoute()
const router = useRouter()
const profilesStore = useProfilesStore()
const progressStore = useProgressStore()

const bookId = computed(() => route.params.id as string)
const book = ref<Book | null>(null)
const contentUrl = ref('')
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const { getById, fetchContent } = useBooksApi()
    book.value = await getById(bookId.value)
    if (!book.value) { router.push('/'); return }

    const buffer = await fetchContent(bookId.value, book.value.format)
    const blob = new Blob([buffer], {
      type: book.value.format === 'epub'
        ? 'application/epub+zip'
        : book.value.format === 'pdf'
          ? 'application/pdf'
          : 'text/plain',
    })
    contentUrl.value = URL.createObjectURL(blob)

    if (profilesStore.activeId) {
      await progressStore.fetchProgress(profilesStore.activeId, bookId.value)
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load book'
  } finally {
    loading.value = false
  }
})

function onProgress(location: Record<string, unknown>, percent: number) {
  if (profilesStore.activeId) {
    progressStore.saveProgress(profilesStore.activeId, bookId.value, {
      format: book.value?.format || '',
      location,
      percent,
    })
  }
}

onUnmounted(() => {
  if (contentUrl.value) URL.revokeObjectURL(contentUrl.value)
})
</script>

<template>
  <div
    class="h-screen flex flex-col"
    :style="{ backgroundColor: book?.format === 'epub' || book?.format === 'pdf' ? '#2b2118' : 'var(--color-parchment)' }"
  >
    <!-- Header -->
    <header class="h-16 bg-coffee border-b-4 border-ocher flex items-center px-6 justify-between shrink-0">
      <router-link
        to="/"
        class="flex items-center gap-2 text-parchment hover:text-ocher transition-colors font-display font-bold uppercase tracking-wide"
      >
        &larr; Library
      </router-link>
      <h1 class="font-display font-bold text-lg text-parchment truncate max-w-md mx-4">
        {{ book?.title || 'Loading...' }}
      </h1>
    </header>

    <!-- Reader -->
    <main class="flex-1 overflow-hidden relative">
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
        <p class="text-parchment font-bold text-xl animate-pulse">Loading...</p>
      </div>

      <div v-else-if="error" class="absolute inset-0 flex items-center justify-center px-8">
        <p class="text-clay font-bold text-center">{{ error }}</p>
      </div>

      <BookReader
        v-else-if="contentUrl && book"
        :book-id="book.id"
        :format="book.format"
        :content-url="contentUrl"
        :initial-location="progressStore.forBook(bookId)?.location"
        :initial-percent="progressStore.forBook(bookId)?.percent"
        @progress="onProgress"
      />

      <div v-else class="absolute inset-0 flex items-center justify-center text-parchment">
        <p>Unable to load book</p>
      </div>
    </main>
  </div>
</template>
```

### 8.5 SettingsPage.vue

```vue
<!-- src/pages/SettingsPage.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useProfilesStore } from '@/stores/profiles'
import { storeToRefs } from 'pinia'

const profilesStore = useProfilesStore()
const { profiles, activeId, loading, error } = storeToRefs(profilesStore)
const newName = ref('')
const message = ref('')

onMounted(() => { profilesStore.fetchProfiles() })

async function addProfile() {
  if (!newName.value.trim()) return
  await profilesStore.createProfile(newName.value.trim())
  newName.value = ''
  showMessage('Profile created')
}

function showMessage(msg: string) {
  message.value = msg
  setTimeout(() => message.value = '', 3000)
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-8">
      <h1 class="font-display text-3xl font-bold text-coffee">Settings</h1>
      <router-link to="/" class="text-sage hover:text-ocher transition-colors font-medium">
        &larr; Library
      </router-link>
    </div>

    <div v-if="message" class="mb-6 p-3 rounded-xl bg-forest/10 border border-forest/30 text-forest font-medium">
      {{ message }}
    </div>

    <div v-if="error" class="mb-6 p-3 rounded-xl bg-clay/10 border border-clay/30 text-clay font-medium">
      {{ error }}
    </div>

    <!-- Profiles -->
    <section class="mb-8">
      <h2 class="font-display text-xl font-bold text-coffee mb-4">Reading Profiles</h2>

      <div v-if="loading" class="text-center py-8 text-sage">Loading profiles...</div>

      <div v-else-if="profiles.length === 0" class="text-center py-8 text-sage">
        No profiles yet. Create one below.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="profile in profiles"
          :key="profile.id"
          class="flex items-center justify-between p-3 rounded-xl bg-card border-2 border-coffee/10"
        >
          <span class="font-medium text-coffee">{{ profile.name }}</span>
          <button
            v-if="profile.id !== activeId"
            class="text-sm font-bold text-ocher hover:text-ocher/80 transition-colors"
            @click="profilesStore.setActiveProfile(profile.id)"
          >
            Select
          </button>
          <span v-else class="text-sm font-bold text-sage">Active</span>
        </div>
      </div>

      <form class="mt-4 flex gap-2" @submit.prevent="addProfile">
        <input
          v-model="newName"
          type="text"
          placeholder="New profile name..."
          class="flex-1 px-3 py-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee placeholder-sage/60 focus:border-ocher focus:outline-none"
        />
        <button
          type="submit"
          class="px-4 py-2 rounded-xl bg-forest text-white font-bold hover:bg-forest/90 transition-colors"
        >
          Add Profile
        </button>
      </form>
    </section>

    <!-- App Info -->
    <section>
      <h2 class="font-display text-xl font-bold text-coffee mb-4">About</h2>
      <p class="text-sm text-leather">JABR v0.1.0</p>
      <p class="text-sm text-leather">Just Another Book Reader</p>
    </section>
  </div>
</template>
```

---

## Phase 9: Build & Deploy

### 9.1 Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "run-p type-check \"build-only {@}\" --",
    "build-only": "vite build",
    "preview": "vite preview",
    "test:unit": "vitest",
    "type-check": "vue-tsc --build",
    "lint": "run-s lint:*",
    "lint:oxlint": "oxlint . --fix",
    "lint:eslint": "eslint . --fix --cache",
    "format": "oxfmt src/",
    "migrate": "tsx scripts/migrate-calibre.ts",
    "db:dev:up": "podman-compose up -d",
    "db:dev:down": "podman-compose down",
    "db:prod:up": "podman-compose -f compose.prod.yml up -d",
    "db:prod:down": "podman-compose -f compose.prod.yml down"
  }
}
```

### 9.2 Production Build

**Development** (existing `compose.yml`):
```bash
podman-compose up -d           # postgres + postgrest (ports 5432, 3001)
pnpm dev                        # vite dev server (port 5173, /api proxy to 3001)
```

**Production** (`compose.prod.yml` + `Dockerfile`):
```bash
podman-compose -f compose.prod.yml up -d
# → postgres (internal) + postgrest (internal) + nginx SPA on port 8080
```

```dockerfile
# Dockerfile — multi-stage build
# Stage 1: Build Vue SPA
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Stage 2: Serve with nginx
FROM docker.io/library/nginx:alpine

RUN apk add --no-cache curl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**nginx.conf** — SPA routing with `/api` proxy:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://postgrest:3000/;  # strips /api prefix
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;   # SPA fallback
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/html;
    gzip_vary on;
}
```

**Architecture (production):**
```
Browser :8080 → nginx → /api/* → PostgREST → PostgreSQL
                       → /*     → Vue SPA (static files)
```

### 9.3 NixOS Module (Future)

Anticipated structure for when NixOS deployment is needed:

```nix
{ config, pkgs, lib, ... }: {
  services.postgresql = {
    enable = true;
    ensureDatabases = [ "jabr" ];
    ensureUsers = [{ name = "jabr"; ensureDBOwnership = true; }];
    initialScript = ./db/init.sql;
  };

  services.postgrest = {
    enable = true;
    instances.jabr = {
      dbUri = "postgres://jabr@/jabr";
      dbSchema = "api";
      dbAnonRole = "anon";
    };
  };

  services.nginx = {
    enable = true;
    virtualHosts."localhost" = {
      root = pkgs.runCommand "jabr-web" {} ''
        cp -r ${./dist} $out
      '';
      locations."/api/" = {
        proxyPass = "http://localhost:3001/";
      };
    };
  };
}
```

---

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm
- podman + podman-compose

### Setup

```bash
# 1. Clone and install
git clone <repo> jabr
cd jabr
pnpm install

# 2. Start PostgreSQL + PostgREST
podman-compose up -d

# 3. Verify PostgREST is running
curl http://localhost:3001/

# 4. Run Calibre migration
pnpm migrate --library ~/Calibre\ Library

# 5. Start dev server
pnpm dev

# 6. Open http://localhost:5173
```

### Data Flow Checklist

```mermaid
flowchart LR
  A[Calibre metadata.db] --> B[Migration Script]
  B --> C[PostgreSQL books table]
  C --> D[PostgREST /books endpoint]
  D --> E[Vue App fetch]
  E --> F[BookCard grid]

  G[Vue App reader page] --> H[fetch /rpc/book_content]
  H --> I[ArrayBuffer -> Blob URL]
  I --> J[EPUB.js or pdfjs-dist]
  J --> K[Canvas rendering]
  K --> L[Location event]
  L --> M[PATCH /book_progress]
```

---

## PostgREST API Reference

### Auto-generated from `api` schema:

| Method | Endpoint | Purpose | Params |
|--------|----------|---------|--------|
| GET | `/books` | List books (paginated) | `?select=...&order=...&limit=...&offset=...` |
| GET | `/books` | Filter books | `?id=eq.uuid&title=ilike.*term*` |
| GET | `/books` | Count books | `?select=count` |
| POST | `/books` | Create book | JSON body |
| PATCH | `/books?id=eq.xxx` | Update book | JSON body |
| DELETE | `/books?id=eq.xxx` | Delete book | |
| GET | `/profiles` | List profiles | |
| POST | `/profiles` | Create profile | `{ name, created_at }` |
| PATCH | `/profiles?id=eq.xxx` | Update profile | |
| GET | `/book_progress` | List progress | `?profile_id=eq.x&book_id=eq.y` |
| PATCH | `/book_progress` | Upsert progress | filters + `{ location, percent, updated_at }` |
| POST | `/book_progress` | Create progress entry | JSON body |
| GET | `/settings` | List settings | |
| POST | `/settings` | Set setting | `{ key, value }` (upserts) |
| POST | `/rpc/book_content` | Stream binary book file | `?book_id=eq.uuid`, Accept header |

### Search Example

```
GET /books?or=(title.ilike.*dune*,author.ilike.*herbert*)&order=title.asc&limit=50
```

### Progress Upsert Example

```
PATCH /book_progress?profile_id=eq.uuid-1&book_id=eq.uuid-2
Content-Type: application/json

{
  "format": "epub",
  "location": { "cfi": "/6/4[chap01]!/4/2/4" },
  "percent": 0.45,
  "updated_at": 1744416000000
}
```

---

## Key Vue Concepts to Learn

### Composition API & `<script setup>`

| Svelte 5 | Vue 3 |
|----------|-------|
| `let x = $state(0)` | `const x = ref(0)` |
| `let y = $derived(x * 2)` | `const y = computed(() => x.value * 2)` |
| `$effect(() => { ... })` | `watch(fn)` or `watchEffect(fn)` |
| `function handler() {}` | `function handler() {}` (same function) |
| `{#if cond}...{/if}` | `v-if="cond"` |
| `{#each items as item}...{/each}` | `v-for="item in items"` |
| `{on:click}` | `@click` |
| `{bind:value}` | `v-model` |
| `let { data } = $props()` | `defineProps<{ data: ... }>()` |
| `export let x` | `defineProps()` |

### Vue-specific Patterns This Project Uses

1. **`v-model` two-way binding** — SearchBar uses `defineModel<string>()`
2. **`v-for` with `:key`** — Book grid iteration
3. **`v-if`/`v-else-if`/`v-else`** — Conditional rendering
4. **`@click.stop`** — Event modifier to stop propagation
5. **`:style` dynamic binding** — Inline styles from refs
6. **`computed`** — Derived values like `bookId`
7. **`watch`** — Side effects on reactive changes
8. **`onMounted`/`onUnmounted`** — Lifecycle hooks
9. **`defineEmits`** — Type-safe event declarations
10. **`defineProps`** — Type-safe props
11. **`router-link`** — Navigation without full page reload
12. **`router.push`** — Programmatic navigation
13. **`storeToRefs`** — Pinia reactive destructuring
14. **Lazy-loaded routes** — `() => import('@/pages/ReaderPage.vue')`

---

## Comparison: SvelteKit Original → Vue Port

| Aspect | Original (SvelteKit) | New (Vue) |
|--------|-------------------|-----------|
| **Framework** | SvelteKit 2 + Svelte 5 | Vue 3.5 + Vite 6 |
| **Backend** | SvelteKit server routes + SQLite | PostgREST + PostgreSQL 16 |
| **API Layer** | Custom endpoints in `routes/api/` | Auto-generated from DB schema |
| **Auth** | Cookie-based password | None (local app) |
| **Book Storage** | Filesystem directory | BYTEA in PostgreSQL |
| **State Management** | Svelte stores (`$state`) | Pinia |
| **Components** | Svelte SFCs | Vue SFCs (`.vue`) |
| **Styling** | Tailwind CSS 4 + custom theme | Same, ported identically |
| **Reader** | epubjs + pdfjs-dist (canvas) | Same libraries, Vue component wrapper |
| **Progress** | Svelte debounce → `PUT /api/progress` | Vue debounce → `PATCH /book_progress` |
| **Container** | Docker | podman-compose |
| **Database Store** | SQLite (`better-sqlite3`) | PostgreSQL BYTEA |

---

*Previous plan (v1) deprecated — see vue-nuxt-port-plan-v1.md for reference*
*Generated for JABR Vue port project*
*Principles: KISS, YAGNI, minimal surface area*
