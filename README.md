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
| `PUT` | `/api/progress/:bookId` | Save reading progress (upserts, because race conditions are for other people) |
| `GET` | `/api/settings` | Get all settings |
| `POST` | `/api/settings` | Save one or more settings |
| `DELETE` | `/api/settings` | Reset the database (irreversible — yes, we warned you) |
| `GET` | `/api/settings/export` | Download a JSON backup of profiles, progress, and settings |
| `POST` | `/api/settings/migrate` | Import from a Calibre library |
| `POST` | `/api/login` | Authenticate (if auth is enabled) |
| `DELETE` | `/api/login` | Deauthenticate |
| `GET` | `/api/login/status` | Check whether auth is even configured |

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
pnpm test:unit        # vitest (for when you're feeling responsible)
```

**Project layout** (because every good project has one, and yours should too):

```
jabr/
├── server/          # Express API (TypeScript, compiled with tsc)
│   ├── index.ts     # Routes, middleware, server entry
│   ├── db.ts        # SQLite init, queries, everything data
│   ├── config.ts    # Constants, env vars, path resolvers
│   ├── scanner.ts   # Filesystem scanning + book indexing
│   ├── migrate.ts   # Calibre migration logic
│   └── tsconfig.json
├── src/             # Vue SPA (`.vue` SFCs, compiled with vue-tsc + vite)
│   ├── main.ts      # Vue entry point
│   ├── App.vue      # Root component
│   ├── router/      # Vue Router config (3 routes)
│   ├── stores/      # Pinia: books, profiles, progress
│   ├── composables/ # API client wrappers
│   ├── components/  # BookCard, SearchBar, SortControls, BookReader...
│   ├── pages/       # Library, Reader, Settings
│   ├── styles/      # Tailwind CSS 4 + custom theme
│   └── types/       # TypeScript interfaces
├── scripts/         # CLI helpers (migrate-calibre.ts)
├── compose.yml      # Podman/Docker Compose for production
├── Dockerfile       # Multi-stage build
├── nginx.conf       # For the compose.prod.yml (if you go that route)
└── vite.config.ts   # Vite config with proxy and plugin setup
```

## Deployment

The Dockerfile does a multi-stage build because we believe in minimal attack surfaces:

1. Install deps with `--frozen-lockfile`, compile TypeScript, build the Vue SPA
2. Copy only the artifacts into a fresh `node:22-alpine` image
3. `CMD ["node", "dist/server/index.js"]` — no cron, no sidecars, no init system

The `compose.yml` mounts `data` and `books` volumes. That's where your stuff lives. Don't lose those.

## Security

JABR is designed for **local network use only**. It is not hardened for direct internet exposure.

If you plan to expose JABR outside your local network, you should implement the following before doing so:

- **Password hashing**: Passwords are currently stored and compared in plain text. Use bcrypt or argon2 for storage and verification.
- **API authentication middleware**: API endpoints are not protected by authentication. Add middleware that verifies the `jabr_auth` cookie on all state-modifying endpoints.
- **Database hardening**: The `resetDatabase` function uses dynamic table names. While currently whitelisted in code, refactor to use explicit queries.
- **HTTPS**: Use a reverse proxy (nginx, Caddy) to terminate TLS.
- **Rate limiting**: Add rate limiting on `/api/login` to prevent brute force attacks.
- **Content Security Policy**: Add proper CSP headers to mitigate XSS risks.

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
