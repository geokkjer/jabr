/**
 * Effect-powered API services.
 * Each service is a plain object whose methods return Effect values.
 */
import { Effect, Schema, pipe } from "effect"
import {
  fetchJsonSafe,
  mutateJson,
  fetchEffect,
  parseJson,
  retryOnNetworkError,
  HttpError,
} from "./http-client"

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

const OkSchema = Schema.Struct({ ok: Schema.Boolean })

const UploadSchema = Schema.Struct({
  ok: Schema.Boolean,
  imported: Schema.Number,
  skipped: Schema.Number,
  failed: Schema.Number,
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      status: Schema.Union(Schema.Literal("imported", "skipped", "failed")),
      reason: Schema.NullOr(Schema.String),
    }),
  ),
})

type DecodedUpload = Schema.Schema.Type<typeof UploadSchema>

/** Per-file outcome of a multi-file / folder import. */
export type UploadStatus = "imported" | "skipped" | "failed"

export interface UploadFileResult {
  path: string
  status: UploadStatus
  reason: string | null
}

export interface UploadResult {
  ok: boolean
  imported: number
  skipped: number
  failed: number
  files: UploadFileResult[]
}

/** Decode the wire shape once so every entry is cloned into a plain object. */
function toUploadResult(decoded: DecodedUpload): UploadResult {
  return {
    ok: decoded.ok,
    imported: decoded.imported,
    skipped: decoded.skipped,
    failed: decoded.failed,
    files: decoded.files.map(
      (entry): UploadFileResult => ({
        path: entry.path,
        status: entry.status,
        reason: entry.reason,
      }),
    ),
  }
}

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

  /**
   * Import one or more files (or a whole folder selection) in a single
   * request. The multipart filename carries the relative path so a folder
   * upload keeps its structure server-side.
   */
  upload: (files: File[]) =>
    pipe(
      Effect.sync(() => {
        const form = new FormData()
        for (const file of files) {
          const relativePath = file.webkitRelativePath || file.name
          form.append("files", file, relativePath)
        }
        return form
      }),
      Effect.flatMap((form) =>
        pipe(
          fetchEffect(`${BASE}/books/upload`, { method: "POST", body: form }),
          Effect.flatMap(parseJson),
          Effect.flatMap(Schema.decodeUnknown(UploadSchema)),
          Effect.map(toUploadResult),
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

  /** Creates the starter profile on a fresh install; idempotent. */
  ensureDefault: () =>
    pipe(
      mutateJson(`${BASE}/profiles/default`, "POST", {}),
      Effect.flatMap(Schema.decodeUnknown(Schema.Array(ProfileSchema))),
    ),

  create: (name: string) =>
    pipe(
      mutateJson(`${BASE}/profiles`, "POST", { name }),
      Effect.flatMap(Schema.decodeUnknown(ProfileSchema)),
    ),

  rename: (id: string, name: string) =>
    pipe(
      mutateJson(`${BASE}/profiles/${encodeURIComponent(id)}`, "PATCH", { name }),
      Effect.flatMap(Schema.decodeUnknown(ProfileSchema)),
    ),
}

// ── Progress API ───────────────────────────────────────────────

export const ProgressApi = {
  listRecent: (profileId: string) =>
    pipe(
      fetchJsonSafe(`${BASE}/progress?profileId=${encodeURIComponent(profileId)}`),
      Effect.flatMap(Schema.decodeUnknown(Schema.Array(BookProgressSchema))),
    ),

  get: (profileId: string, bookId: string) =>
    pipe(
      fetchJsonSafe(
        `${BASE}/progress/${encodeURIComponent(bookId)}?profileId=${encodeURIComponent(profileId)}`,
      ),
      // The server answers `null` when nothing has been saved yet
      Effect.flatMap(Schema.decodeUnknown(Schema.NullOr(BookProgressSchema))),
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

// ── Admin API ──────────────────────────────────────────────────

export const AdminApi = {
  /** Irreversible: wipes profiles, progress and the book index. */
  reset: () =>
    pipe(
      Effect.tryPromise(() => fetch(`${BASE}/admin/data`, { method: "DELETE" })),
      Effect.filterOrFail(
        (res) => res.ok,
        (res) => new HttpError(res.status, `${res.status}: ${res.statusText}`),
      ),
      Effect.as(undefined as void),
    ),

  exportUrl: `${BASE}/admin/export`,
}
