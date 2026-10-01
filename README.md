# JABR

**Just Another Book Reader.**

A self-hosted e-book reader that lives in your browser. Drop files in a directory, read them from anywhere. Supports EPUB, PDF, and plain text.

We wrote this so we could read our books without handing our soul to Amazon, Google, or some VC-backed startup that will raise prices in six months. You know the drill.

## Architecture

```
┌─────────────────────────────────────────┐
│  Vue 3 SPA (Vite)                       │
│  Vue Router · Pinia · Tailwind CSS 4    │
│  epubjs · pdfjs-dist                    │
│                                         │
│  Port 5173 (dev)                        │
│  Vite proxy: /api/* → localhost:3001    │
└────────────┬────────────────────────────┘
             │  HTTP (REST + JSON)
             ▼
┌─────────────────────────────────────────┐
│  Express 5                              │
│  Port 3001 (dev + prod)                 │
│                                         │
│  Serves the Vue SPA in production       │
│  Serves the REST API always             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  better-sqlite3                 │    │
│  │  → profiles, progress, index    │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  multer                         │    │
│  │  → file uploads to books/       │    │
│  └─────────────────────────────────┘    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  SQLite file (data/jabr.sqlite3)        │
│  Books directory (books/)               │
│                                         │
│  "It's not much, but it's honest work"  │
└─────────────────────────────────────────┘
```

**Frontend**: Vue 3 + Vue Router + Pinia + Tailwind CSS 4 — because Vue is the framework that realized you can have nice things without yelling about signals.

**Backend**: Express 5 + better-sqlite3 — serves the SPA and REST API from a single process. One `node`, one port, zero ceremony.

**Storage**: Books live on the filesystem (`books/`). Metadata lives in SQLite (`data/jabr.sqlite3`). No binary blobs in the database, no content addressing, no object storage gateway. Books are files. Files go in a folder. It's not complicated.

**Reader**: epubjs for EPUBs, pdfjs-dist for PDFs, good old `<iframe>` for text files.

## Quick Start

### Prerequisites

- Node.js 22+ (because it's 2026 and we have standards)
- pnpm (npm is fine too, but pnpm is faster and we like fast things)
- podman or Docker (for the containerized deployment, optional)

### Local Development

```sh
pnpm install
pnpm dev
```

This fires up two things in parallel:
- Vite dev server on `http://localhost:5173`
- Express API on `http://localhost:3001`

Vite proxies `/api/*` to the Express server automatically. It's like magic, but with less smoke and mirrors and more `vite.config.ts`.

### Production Build

```sh
pnpm build
NODE_ENV=production node dist/server/index.js
```

The built SPA (`dist/`) is served by Express itself. No nginx. No reverse proxy. No container orchestration platform that needs its own dedicated SRE team. Just `node` and a file descriptor or two.

### Docker

```sh
podman compose up -d
```

Hits `http://localhost:8080`. The container runs the production build. Mount `data` and `books` volumes for persistence. That's it. That's the whole deployment strategy.

## Configuration

The app reads its config from environment variables. Because that's what adults do.

| Env | Default | Description |
|---|---|---|
| `JABR_PORT` | `3001` | HTTP port for the API + SPA server |
| `JABR_DB_PATH` | `./data/jabr.sqlite3` | SQLite database file path |
| `JABR_BOOKS_PATH` | `./books` | Directory with your book files |
| `NODE_ENV` | `development` | Set to `production` to serve the built SPA |

No `.env.example` file. No `.env.production.local.template` nonsense. If you need to configure it, set the variable. If you don't, the defaults work.

## API

All endpoints live under `/api`. Every response is JSON unless it's a book file, in which case it's the raw bytes because duh.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Returns `{"status":"ok"}` — for container health checks and existential reassurance |
| `GET` | `/api/books` | Scan filesystem and return indexed books with metadata |
| `GET` | `/api/books/search?q=` | Search by title or author (case-insensitive, because we're not monsters) |
| `GET` | `/api/books/:id` | Get a single book by ID |
| `GET` | `/api/book/*` | Serve a book file with the correct Content-Type |
| `POST` | `/api/books/upload` | Upload a book (multipart form, max 512MB) |
| `GET` | `/api/profiles` | List reading profiles |
| `POST` | `/api/profiles` | Create a profile (body: `{ "name": "string" }`) |
| `GET` | `/api/progress/:bookId?profileId=` | Get reading progress for a book+profile combo |
| `GET` | `/api/progress?profileId=` | Recent progress for a profile ("currently reading") |
| `PUT` | `/api/progress/:bookId` | Save reading progress (upserts, because race conditions are for other people) |
| `GET` | `/api/settings` | Get all settings |
| `POST` | `/api/settings` | Save one or more settings |
| `DELETE` | `/api/settings` | Reset the database (irreversible — yes, we warned you) |
| `GET` | `/api/settings/export` | Download a JSON backup of profiles, progress, and settings |
| `POST` | `/api/settings/migrate` | Import from a Calibre library |

## Calibre Migration

Two paths, same destination:

1. **CLI**: `pnpm migrate --library /path/to/calibre/library`
2. **Settings page**: the "Migrate from Calibre" wizard with preview-then-execute flow

Both copy files from Calibre's directory structure into `books/` using `Author - Title.ext` naming. It's additive — run it against multiple libraries all you want. Identical filenames are silently skipped because we trust your original Calibre library has the canonical copies.

The migration script reads Calibre's `metadata.db` (SQLite) directly and copies the actual book files. Calibre itself is never invoked. No subprocesses, no XML parsing, no prayers.

## Development

```sh
pnpm dev              # frontend + backend with hot reload
pnpm build            # type-check + build both
pnpm lint             # eslint + oxlint (double the pain, half the bugs)
pnpm format           # oxfmt (formats your code and judges your spacing choices)
pnpm test             # client + server suites, once
pnpm test:client      # vitest in jsdom (stores, utils, invariants)
pnpm test:server      # vitest in node, in-memory SQLite (db, scanner, API)
pnpm test:unit        # vitest in watch mode (for when you're feeling responsible)
```

### Testing notes

Two vitest configs exist on purpose:

- `vitest.config.ts` — jsdom, `src/**/__tests__/*` only.
- `vitest.server.config.ts` — node env, `server/**/__tests__/*`, with `JABR_DB_PATH=:memory:` and `NODE_ENV=test`.

Server tests must **never** be run under the client config: they call `resetDatabase()` in `beforeEach` and would wipe the real `data/jabr.sqlite3`. The `server/**` exclusion in the client config is load-bearing.

### Troubleshooting

**`ENOSPC: System limit for number of file watchers reached`** on `pnpm dev`

Your system has run out of inotify watches (VSCode, browsers and assorted desktop services are usually the culprits — check with `sysctl fs.inotify.max_user_watches` versus the sum of `inotify` entries in `/proc/*/fdinfo/*`). Raise the limit:

```sh
echo 'fs.inotify.max_user_watches=1048576' | sudo tee /etc/sysctl.d/99-inotify.conf
sudo sysctl --system
```

Nothing is wrong with the project when this happens — `tsx watch` and `vite` simply cannot register a single additional watch.


**Project layout** (because every good project has one, and yours should too):

```
jabr/
├── server/          # Express API (TypeScript, bundled by esbuild)
│   ├── index.ts     # App wiring and server entry
│   ├── routes/      # health, books, profiles, progress, settings
│   ├── db.ts        # SQLite init, queries, everything data
│   ├── config.ts    # Constants, env vars, path resolvers
│   ├── scanner.ts   # Filesystem scanning + book indexing
│   ├── migrate.ts   # Calibre migration logic
│   └── __tests__/   # node-env vitest suites (see vitest.server.config.ts)
├── src/             # Vue SPA (`.vue` SFCs, compiled with vue-tsc + vite)
│   ├── main.ts      # Vue entry point
│   ├── App.vue      # Root component
│   ├── router/      # Vue Router config (library, reader, settings)
│   ├── stores/      # Pinia setup stores: books, profiles, progress, settings
│   ├── services/    # Effect-TS HTTP client + typed API services
│   ├── components/  # BookCard, SearchBar, BookReader + readers/{Epub,Pdf,Text}
│   ├── pages/       # Library, Reader, Settings
│   ├── styles/      # Tailwind CSS 4 + custom theme
│   ├── types/       # TypeScript interfaces
│   └── __tests__/   # jsdom vitest suites (stores, invariants, format)
├── scripts/         # CLI helpers (migrate-calibre.ts)
├── jabr.allium      # Behavioural specification the tests are derived from
├── compose.yml      # Podman/Docker Compose for production
├── Dockerfile       # Multi-stage build
├── nginx.conf       # For the compose.prod.yml (if you go that route)
└── vite.config.ts   # Vite config with proxy and plugin setup
```

## Deployment

The Dockerfile does a multi-stage build because we believe in minimal attack surfaces:

1. **build** — `pnpm install --frozen-lockfile` (build scripts limited to the `allowBuilds` list in `pnpm-workspace.yaml`), then `pnpm build`. The SPA is bundled by Vite; the server is bundled by esbuild into a single `dist/server/index.js`.
2. **native closure** — esbuild inlines every pure-JS dependency (Express, multer, cors, …), so the only thing that must exist on disk at runtime is the native `better-sqlite3` module plus its two load-time helpers (`bindings`, `file-uri-to-path`). Those are copied with resolved symlinks, stripped of build-only SQLite sources and object files (~2 MB), and the build **fails loudly** if the module cannot load from that closure.
3. **runtime** — `node:24-alpine` with only `dist/`, the ~2 MB native closure, and `package.json` (needed for `"type": "module"`). Runs as the unprivileged `node` user, with `/app/data` and `/app/books` pre-created and chowned so the named volumes inherit writable ownership.
4. `CMD ["node", "dist/server/index.js"]` — no cron, no sidecars, no init system. An image-level `HEALTHCHECK` polls `/api/health`.

Because the server is a bundle, the image carries no `node_modules` tree of its own — no devDependencies, no compiler toolchain, and no compiled test suites.

The `compose.yml` mounts `data` and `books` volumes. That's where your stuff lives. Don't lose those.

> Building with podman defaults to the OCI image format, which silently **drops** `HEALTHCHECK`. Use `podman build --format docker .` (or run the healthcheck from Compose) if you want container health reporting.

> Building with podman defaults to the OCI image format, which silently **drops** `HEALTHCHECK`. Use `podman build --format docker .` (or run the healthcheck from Compose) if you want container health reporting.

## Security

**JABR has no authentication, and that is a decision, not an oversight.**

This is a self-hosted reader for a trusted internal network — your LAN, your NAS, your tailnet. There are no accounts, no sessions, no cookies and no password field, because reader profiles exist to keep *reading positions* separate, not to keep people out. Inventing a half-authenticated API would be worse than having none: it would look like a security boundary while protecting nothing.

The corollary is blunt: **do not expose JABR to the internet.** Two reasons, in ascending order of importance:

1. The API is unauthenticated by design. Anyone who can reach the port can read, upload, and delete everything.
2. Publicly serving a library of copyrighted books is a legal conversation nobody wants to have with a rights holder.

If you need remote access, put it behind something that already knows how to do this: WireGuard/Tailscale, or an authenticating reverse proxy (Authelia, oauth2-proxy, mTLS). Keep the app what it is.

What the app *does* handle on its own, because it costs nothing:

- Book file paths are resolved and traversal-checked (`..` cannot escape the books directory).
- Uploads are limited to the extension allowlist and sanitised filenames.
- Text/markdown is rendered in a sandboxed iframe.
- All SQL is parameterised.

Known rough edges if you ever *do* put this behind an authenticating proxy: `DELETE /api/settings` resets the database with dynamic table names (whitelisted in code, but refactor before trusting it), and `GET /api/settings/export` returns the full backup — so gate state-modifying endpoints at the proxy.

## Why not PostgreSQL?

Because this app has exactly five tables and zero relationships worth indexing across a network socket. SQLite is a single file, needs no daemon, survives `podman compose down` without a `pg_dump` ritual, and handles the workload of one human reading one book at a time without breaking a sweat.

The original version (yes, there was a previous version) used PostgreSQL + PostgREST. It worked. It was also complete overkill — like using a cargo ship to cross a pond. We drained the pond and built a bridge instead.

If your use case requires PostgreSQL-level throughput for five SQLite tables that serve one user, you should probably put down the e-reader and go touch some grass.

## Why not Svelte?

The previous version was SvelteKit. It was fine. We just like Vue more. Sue us.

## Why not [insert your favorite tech stack]?

We made choices. You can make different ones. That's why it's called "Just Another Book Reader" — it's ours. Make yours.

## License

[AGPL-3.0-or-later](LICENSE) — because sharing is caring, and also because the license text is 33,943 bytes which is honestly longer than most of the code.
