# Effect-TS Refactoring Guide

> How and why we introduced [Effect-TS](https://effect-ts.github.io/) into the JABR frontend.

---

## Table of Contents

1. [Why Effect?](#1-why-effect)
2. [Architecture overview](#2-architecture-overview)
3. [File layout](#3-file-layout)
4. [The HTTP client layer](#4-the-http-client-layer)
5. [The API service layer](#5-the-api-service-layer)
6. [The store (Pinia) layer](#6-the-store-pinia-layer)
7. [The component layer](#7-the-component-layer)
8. [Error handling patterns](#8-error-handling-patterns)
9. [Adding a new API endpoint](#9-adding-a-new-api-endpoint)
10. [Testing with Effect](#10-testing-with-effect)

---

## 1. Why Effect?

Before the refactor, every API call looked like this:

```ts
// Before: hand-rolled fetch, manual try/catch, no retry, no timeout
async function fetchBooks(): Promise<Book[]> {
  const res = await fetch('/api/books')
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}
```

Problems with this approach:

| Problem | Consequence |
|---|---|
| Errors are `throw`n — untyped | TypeScript can't track what can fail |
| No retry logic | Every caller must wrap in retry loops |
| No timeout | A stuck request hangs forever |
| `Promise<Book[]>` hides errors | Callers don't know it can fail until runtime |
| Manual JSON parsing | No runtime validation — silent data corruption |

After the refactor, the same call looks like this:

```ts
// After: typed, retryable, timeboxed
BookApi.list   // Effect<Book[], HttpError | NetworkError>
  |> Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.recurs(3)))
  |> Effect.timeout("10 seconds")
```

Every error path is **typed** in the compiler. Every async concern (retry, timeout, cancellation) is built-in.

---

## 2. Architecture overview

```
┌───────────────────────────────────────────┐
│              Vue Components                │  ← <script setup lang="ts">
│    ReaderPage, LibraryPage, SettingsPage   │     Knows only about stores & template
├───────────────────────────────────────────┤
│          Pinia Setup Stores                │  ← defineStore('id', () => { ... })
│    books, profiles, auth, progress,        │     Thin: calls Effect.runPromise() at boundary
│    settings                                │     Holds reactive refs, exposes computed getters
├───────────────────────────────────────────┤
│           Effect API Services              │  ← services/api.ts
│    BookApi, ProfileApi, ProgressApi,       │     Pure Effect: pipe, Schema.decode, retry
│    SettingsApi, AuthApi, MigrationApi      │     No Vue, no Pinia — framework-agnostic
├───────────────────────────────────────────┤
│           Effect HTTP Client               │  ← services/http-client.ts
│    fetchEffect, fetchJson, fetchJsonSafe,  │     Typed errors, retry schedule, timeout
│    mutateJson, mutateFormData              │
├───────────────────────────────────────────┤
│                 fetch()                    │  ← the browser API
└───────────────────────────────────────────┘
```

**Key rule:** Effect lives in the two service layers. Pinia stores call `Effect.runPromise()` to bridge into Vue's reactive world. Components never touch Effect directly.

---

## 3. File layout

```
src/
├── services/
│   ├── http-client.ts      ← Core fetch helpers (Effect)
│   └── api.ts              ← All API endpoints (Effect + Schema)
├── stores/
│   ├── books.ts            ← Pinia setup store
│   ├── profiles.ts         ← Pinia setup store
│   ├── progress.ts         ← Pinia setup store
│   ├── auth.ts             ← Pinia setup store
│   └── settings.ts         ← Pinia setup store
├── pages/
│   ├── LibraryPage.vue     ← <script setup>
│   ├── ReaderPage.vue      ← <script setup>
│   ├── SettingsPage.vue    ← <script setup>
│   └── LoginPage.vue       ← <script setup>
├── types/
│   └── index.ts            ← Plain TypeScript interfaces (no Effect types)
└── composables/            ← Mostly removed; logic lives in services/stores
```

---

## 4. The HTTP client layer

**File:** `services/http-client.ts`

### Error types

```ts
class HttpError {
  readonly _tag = "HttpError"
  constructor(readonly status: number, readonly message: string) {}
}

class NetworkError {
  readonly _tag = "NetworkError"
  constructor(readonly cause: unknown) {}
}

type FetchError = HttpError | NetworkError
```

The `_tag` property enables discriminated union matching with `Effect.catchTag`.

### Core functions

| Function | Returns | Use case |
|---|---|---|
| `fetchEffect(url, opts?)` | `Effect<Response, FetchError>` | Raw fetch, headers, streaming |
| `fetchJson(url, opts?)` | `Effect<unknown, FetchError>` | GET a JSON endpoint |
| `fetchJsonSafe(url, opts?)` | `Effect<unknown, FetchError>` | Same + auto-retry on network errors |
| `mutateJson(url, method, body)` | `Effect<unknown, FetchError>` | POST/PUT/DELETE with JSON body |
| `mutateFormData(url, form)` | `Effect<unknown, FetchError>` | File upload (FormData) |

### Retry policy

```ts
const retryOnNetworkError = Schedule.exponential("100 millis")
  .pipe(Schedule.recurs(3))
  .pipe(Schedule.whileInput((err) => err._tag === "NetworkError"))
```

Only retries on network failures (offline, DNS, connection reset), **not** on HTTP 4xx/5xx. Exponential back-off starts at 100ms.

---

## 5. The API service layer

**File:** `services/api.ts`

### Pattern: Schema + Effect

Every endpoint follows this pattern:

```ts
export const BookApi = {
  list: pipe(
    fetchJsonSafe(`${BASE}/books`),                    // Effect<unknown, FetchError>
    Effect.flatMap(Schema.decodeUnknown(Schema.Array(BookSchema))),  // validate + infer type
    Effect.timeout("10 seconds"),                       // don't hang forever
  ),
}
```

### Schemas

Use `Schema.Struct` to validate API responses at runtime. This catches API contract violations immediately:

```ts
const BookSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  path: Schema.String,
  format: Schema.Union(Schema.Literal("pdf", "epub", "txt", "md", "unknown")),
  size: Schema.Number,
  mtime: Schema.String,
})
```

### 404 handling

When an endpoint can return 404 (meaning "not found" not "error"):

```ts
getById: (id: string) =>
  pipe(
    fetchJsonSafe(`${BASE}/books/${encodeURIComponent(id)}`),
    Effect.flatMap(Schema.decodeUnknown(BookSchema)),
    Effect.catchAll((err) => {
      if (err._tag === "HttpError" && err.status === 404) {
        return Effect.succeed(null)          // ← 404 becomes null, not an error
      }
      return Effect.fail(err)
    }),
  ),
```

---

## 6. The store (Pinia) layer

All stores use **Pinia setup stores** (`defineStore('id', () => { ... })`), never Options API.

### The boundary pattern

The store is where Effect meets Vue. The rule is simple:

> **Effect lives in services → stores call `Effect.runPromise()` → result goes into `ref`**

```ts
export const useBooksStore = defineStore('books', () => {
  const books = ref<Book[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchBooks() {
    loading.value = true
    error.value = null

    const result = await Effect.runPromise(
      pipe(
        BookApi.list,
        Effect.catchAll((err) => {
          error.value = err.message
          return Effect.succeed([])       // fallback on error
        }),
      ),
    )
    books.value = result
    loading.value = false
  }

  return { books, loading, error, fetchBooks }
})
```

### Error recovery in stores

Always catch errors at the store boundary and map them into reactive state:

```ts
Effect.catchAll((err) => {
  error.value = err.message       // ← populate the reactive error ref
  return Effect.succeed(defaultValue)  // ← provide a fallback value
})
```

### When to throw

If an action needs to propagate an error to the caller (e.g. form submission):

```ts
Effect.catchAll((err) => {
  error.value = err.message
  return Effect.fail(err)          // ← re-fail so the caller can catch
})
```

The caller (component or another action) can then `try/catch` around `Effect.runPromise()`.

---

## 7. The component layer

Components stay **dumb** — they call store actions and render template:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useBooksStore } from '@/stores/books'
import { storeToRefs } from 'pinia'

const store = useBooksStore()
const { books, loading, error } = storeToRefs(store)

onMounted(() => store.fetchBooks())
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">{{ error }}</div>
  <div v-else>
    <div v-for="book in books" :key="book.id">{{ book.title }}</div>
  </div>
</template>
```

If a component needs one-off Effect logic (e.g. ReaderPage fetching a book by ID), it uses `Effect.runPromise()` **directly** with the service, not a store:

```ts
const result = await Effect.runPromise(
  pipe(
    BookApi.getById(bookId.value),
    Effect.catchAll((err) => {
      error.value = err.message
      return Effect.succeed(null)
    }),
  ),
)
```

This is acceptable for **page-level data fetching** that isn't shared across components.

---

## 8. Error handling patterns

### Matching specific errors

```ts
pipe(
  BookApi.getById(id),
  Effect.catchTag("HttpError", (err) => {
    if (err.status === 404) return Effect.succeed(null)
    return Effect.fail(err)
  }),
  Effect.catchTag("NetworkError", () => Effect.succeed(fallback)),
)
```

### Retry on specific conditions

```ts
Effect.retry(
  Schedule.exponential("100 millis").pipe(
    Schedule.recurs(3),
    Schedule.whileInput((err) => err._tag === "NetworkError"),
  ),
)
```

### Timeout

```ts
Effect.timeout("10 seconds")
```

When a timeout fires, the Effect fails with a `TimeoutException` (from Effect's built-in `Cause`). You can catch it:

```ts
Effect.catchAll((err) => {
  if (err._tag === "TimeoutException") return Effect.succeed(fallback)
  return Effect.fail(err)
})
```

---

## 9. Adding a new API endpoint

Suppose the backend adds `GET /api/tags` returning `{ tags: string[] }`.

### Step 1: Add a schema in `services/api.ts`

```ts
const TagsResponseSchema = Schema.Struct({
  tags: Schema.Array(Schema.String),
})
```

### Step 2: Add the API method

```ts
export const TagApi = {
  list: pipe(
    fetchJsonSafe(`${BASE}/tags`),
    Effect.flatMap(Schema.decodeUnknown(TagsResponseSchema)),
    Effect.map((res) => res.tags),
  ),
}
```

### Step 3: Add a store (if shared state) or call directly (if page-local)

**Store (shared across components):**

```ts
// stores/tags.ts
export const useTagsStore = defineStore('tags', () => {
  const tags = ref<string[]>([])
  const loading = ref(false)

  async function fetchTags() {
    loading.value = true
    const result = await Effect.runPromise(
      pipe(TagApi.list, Effect.catchAll(() => Effect.succeed([]))),
    )
    tags.value = result
    loading.value = false
  }

  return { tags, loading, fetchTags }
})
```

**Direct (page-local, no sharing needed):**

```vue
<script setup lang="ts">
const tags = ref<string[]>([])

onMounted(async () => {
  const result = await Effect.runPromise(
    pipe(TagApi.list, Effect.catchAll(() => Effect.succeed([]))),
  )
  tags.value = result
})
</script>
```

---

## 10. Testing with Effect

Effect makes testing easy because you can **provide mock services** instead of hitting real APIs.

### Example: testing the books store

```ts
import { describe, it, expect, vi } from 'vitest'
import { Effect, pipe } from 'effect'
import { setActivePinia, createPinia } from 'pinia'
import { useBooksStore } from '@/stores/books'

// Mock the BookApi
vi.mock('@/services/api', () => ({
  BookApi: {
    list: Effect.succeed([
      { id: '1', title: 'Test Book', author: 'Test Author',
        path: '/a.pdf', format: 'pdf', size: 100, mtime: '2024-01-01' },
    ]),
  },
}))

describe('books store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('fetches books successfully', async () => {
    const store = useBooksStore()
    await store.fetchBooks()
    expect(store.books).toHaveLength(1)
    expect(store.books[0]?.title).toBe('Test Book')
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })
})
```

### Testing services with layer injection

For more advanced testing, you can use Effect's `Layer` system to inject mock HTTP clients:

```ts
import { Effect, Layer, TestContext } from 'effect'

// Provide a mock HTTP layer
const mockHttpLayer = Layer.succeed(
  HttpClient,
  HttpClient.of({
    request: (_url: string) =>
      Effect.succeed(new Response(JSON.stringify(mockData), { status: 200 })),
  }),
)

const testEffect = BookApi.list.pipe(Effect.provide(mockHttpLayer))
const result = await Effect.runPromise(testEffect)
```

---

## Quick reference

| Concept | Effect equivalent |
|---|---|
| `Promise<T>` | `Effect<T, never, never>` |
| `Promise<T> // can throw` | `Effect<T, Error, never>` |
| `try { ... } catch (e) { ... }` | `Effect.catchAll(...)` |
| `if (err.type === 'X')` | `Effect.catchTag("X", ...)` |
| `fetch(url).then(r => r.json())` | `fetchJson(url) \|> Effect.flatMap(Schema.decode(...))` |
| `setTimeout(retry, 1000)` | `Schedule.fixed("1 second")` |
| `Promise.race([p, timeout])` | `Effect.timeout("5 seconds")` |
| `await Promise.all([a, b])` | `Effect.all([a, b])` |
| `new Promise((res, rej) => ...)` | `Effect.async<A, E>((emit) => ...)` |
