/**
 * Effect-powered HTTP client.
 * Single source of truth for all networking in the app.
 */
import { Effect, Schedule, pipe } from "effect"

// ── Error types ────────────────────────────────────────────────

export class HttpError {
  readonly _tag = "HttpError"
  constructor(
    readonly status: number,
    readonly message: string,
  ) {}
}

export class NetworkError {
  readonly _tag = "NetworkError"
  constructor(readonly cause: unknown) {}
}

export type FetchError = HttpError | NetworkError

// ── Retry policy ───────────────────────────────────────────────

/** Retry up to 3 times on network errors only (not 4xx/5xx) */
export const retryOnNetworkError = <A, E extends FetchError>(
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  pipe(
    effect,
    Effect.retry(
      Schedule.exponential("100 millis").pipe(
        Schedule.recurs(3),
        Schedule.whileInput((err: FetchError) => err._tag === "NetworkError"),
      ),
    ),
  )

// ── Core fetch helpers ──────────────────────────────────────────

/** Fetch a URL, returning Effect that fails on non-ok status */
export const fetchEffect = (
  url: string,
  options?: RequestInit,
): Effect.Effect<Response, FetchError> =>
  pipe(
    Effect.tryPromise({
      try: () => fetch(url, options),
      catch: (cause) => new NetworkError(cause),
    }),
    Effect.filterOrFail(
      (res) => res.ok,
      (res) => {
        // Try to extract body text for better error messages
        return new Promise<HttpError>((resolve) => {
          res.text().then(
            (body) => resolve(new HttpError(res.status, `${res.status}: ${body || res.statusText}`)),
            () => resolve(new HttpError(res.status, res.statusText)),
          )
        })
      },
    ),
  )

/** Parse response as JSON */
const parseJson = (res: Response): Effect.Effect<unknown, NetworkError> =>
  Effect.tryPromise({
    try: () => res.json() as Promise<unknown>,
    catch: (cause) => new NetworkError(cause),
  })

/** Fetch a URL and return parsed JSON */
export const fetchJson = (
  url: string,
  options?: RequestInit,
): Effect.Effect<unknown, FetchError> =>
  pipe(fetchEffect(url, options), Effect.flatMap(parseJson))

/** Fetch + parse, retrying on network errors */
export const fetchJsonSafe = (
  url: string,
  options?: RequestInit,
): Effect.Effect<unknown, FetchError> =>
  pipe(fetchJson(url, options), retryOnNetworkError)

/** Mutating request (POST/PUT/DELETE) that returns JSON */
export const mutateJson = (
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
): Effect.Effect<unknown, FetchError> =>
  pipe(
    fetchJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )

/** Mutating request with FormData (file upload) */
export const mutateFormData = (
  url: string,
  form: FormData,
): Effect.Effect<unknown, FetchError> =>
  pipe(
    fetchJson(url, {
      method: "POST",
      body: form,
    }),
  )
