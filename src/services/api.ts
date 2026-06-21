/**
 * Effect-powered API services.
 * Each service is a plain object whose methods return Effect values.
 */
import { Effect, Schema, pipe } from "effect"
import { fetchJsonSafe, mutateJson, mutateFormData, retryOnNetworkError } from "./http-client"

const BASE = "/api"

// ── Schemas ────────────────────────────────────────────────────

const BookSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  path: Schema.String,
  format: Schema.Union(
    Schema.Literal("pdf", "epub", "txt", "md", "unknown"),
  ),
  size: Schema.Number,
  mtime: Schema.String,
})

const BookProgressSchema = Schema.Struct({
  profileId: Schema.String,
  bookId: Schema.String,
  format: Schema.String,
  locationJson: Schema.String,
  percent: Schema.NullOr(Schema.Number),
  updatedAt: Schema.Number,
})

const ProfileSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.Number,
})

const SettingsSchema = Schema.Struct({
  authEnabled: Schema.NullOr(Schema.String),
  username: Schema.NullOr(Schema.String),
  password: Schema.NullOr(Schema.String),
  libraryPath: Schema.NullOr(Schema.String),
  readerTarget: Schema.NullOr(Schema.String),
  calibreMigrated: Schema.NullOr(Schema.String),
  calibreLibraryPath: Schema.NullOr(Schema.String),
})

const MigrateResultSchema = Schema.Struct({
  dryRun: Schema.Boolean,
  total: Schema.Number,
  copied: Schema.Number,
  skipped: Schema.Number,
  errors: Schema.Number,
  details: Schema.Array(
    Schema.Struct({
      action: Schema.Literal("copy", "skip", "error", "dry-run"),
      title: Schema.String,
      author: Schema.String,
      format: Schema.String,
      reason: Schema.optional(Schema.String),
    }),
  ),
  errors_list: Schema.Array(Schema.String),
})

const OkSchema = Schema.Struct({ ok: Schema.Boolean })
const AuthStatusSchema = Schema.Struct({ authEnabled: Schema.Boolean })

// ── Book API ───────────────────────────────────────────────────

export const BookApi = {
  list: pipe(
    fetchJsonSafe(`${BASE}/books`),
    Effect.flatMap(Schema.decodeUnknown(Schema.Array(BookSchema))),
    Effect.timeout("10 seconds"),
  ),

  search: (query: string) =>
    pipe(
      fetchJsonSafe(`${BASE}/books/search?q=${encodeURIComponent(query)}`),
      Effect.flatMap(Schema.decodeUnknown(Schema.Array(BookSchema))),
    ),

  getById: (id: string) =>
    pipe(
      fetchJsonSafe(`${BASE}/books/${encodeURIComponent(id)}`),
      Effect.flatMap(Schema.decodeUnknown(BookSchema)),
      Effect.catchAll((err) => {
        if (err._tag === "HttpError" && err.status === 404) {
          return Effect.succeed(null)
        }
        return Effect.fail(err)
      }),
    ),

  getContentUrl: (id: string) => `${BASE}/book/${encodeURIComponent(id)}`,

  upload: (file: File) =>
    pipe(
      Effect.sync(() => {
        const form = new FormData()
        form.append("file", file)
        return form
      }),
      Effect.flatMap((form) =>
        pipe(
          Effect.tryPromise(() =>
            fetch(`${BASE}/upload`, { method: "POST", body: form }),
          ),
          Effect.flatMap((res) =>
            res.ok
              ? Effect.tryPromise(() => res.json() as Promise<{ ok: boolean; id: string }>)
              : Effect.tryPromise(() => res.text().then((t) => Promise.reject(new Error(t)))),
          ),
        ),
      ),
      retryOnNetworkError,
    ),
}

// ── Profile API ────────────────────────────────────────────────

export const ProfileApi = {
  list: pipe(
    fetchJsonSafe(`${BASE}/profiles`),
    Effect.flatMap(Schema.decodeUnknown(Schema.Array(ProfileSchema))),
  ),

  create: (name: string) =>
    pipe(
      mutateJson(`${BASE}/profiles`, "POST", { name }),
      Effect.flatMap(Schema.decodeUnknown(ProfileSchema)),
    ),
}

// ── Progress API ───────────────────────────────────────────────

export const ProgressApi = {
  get: (profileId: string, bookId: string) =>
    pipe(
      fetchJsonSafe(
        `${BASE}/progress/${encodeURIComponent(bookId)}?profileId=${encodeURIComponent(profileId)}`,
      ),
      Effect.flatMap(Schema.decodeUnknown(BookProgressSchema)),
      Effect.catchAll((err) => {
        if (err._tag === "HttpError" && err.status === 404) {
          return Effect.succeed(null)
        }
        return Effect.fail(err)
      }),
    ),

  save: (
    profileId: string,
    bookId: string,
    data: { format: string; location: Record<string, unknown>; percent: number },
  ) =>
    pipe(
      mutateJson(
        `${BASE}/progress/${encodeURIComponent(bookId)}`,
        "PUT",
        { profileId, ...data },
      ),
      Effect.flatMap(Schema.decodeUnknown(OkSchema)),
      Effect.as(undefined as void),
    ),
}

// ── Settings API ───────────────────────────────────────────────

export const SettingsApi = {
  get: pipe(
    fetchJsonSafe(`${BASE}/settings`),
    Effect.flatMap(Schema.decodeUnknown(SettingsSchema)),
  ),

  save: (partial: Record<string, unknown>) =>
    pipe(
      mutateJson(`${BASE}/settings`, "POST", partial),
      Effect.flatMap(Schema.decodeUnknown(OkSchema)),
      Effect.as(undefined as void),
    ),

  reset: () =>
    pipe(
      Effect.tryPromise(() =>
        fetch(`${BASE}/settings`, { method: "DELETE" }),
      ),
      Effect.filterOrFail(
        (res) => res.ok,
        (res) => new Error(`${res.status}: ${res.statusText}`),
      ),
      Effect.as(undefined as void),
    ),
}

// ── Migration API ─────────────────────────────────────────────

export const MigrationApi = {
  run: (options?: { dryRun?: boolean; profileName?: string }) =>
    pipe(
      mutateJson(`${BASE}/migrate`, "POST", options ?? {}),
      Effect.flatMap(Schema.decodeUnknown(MigrateResultSchema)),
    ),
}

// ── Auth API ───────────────────────────────────────────────────

export const AuthApi = {
  login: (username: string, password: string) =>
    pipe(
      mutateJson(`${BASE}/login`, "POST", { username, password }),
      Effect.flatMap(Schema.decodeUnknown(OkSchema)),
      Effect.as(undefined as void),
    ),

  logout: () =>
    pipe(
      mutateJson(`${BASE}/login`, "DELETE", {}),
      Effect.flatMap(Schema.decodeUnknown(OkSchema)),
      Effect.as(undefined as void),
    ),

  status: () =>
    pipe(
      fetchJsonSafe(`${BASE}/login/status`),
      Effect.flatMap(Schema.decodeUnknown(AuthStatusSchema)),
    ),
}
