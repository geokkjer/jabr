# JABR

Just Another Book Reader.

A self-hosted e-book reader for the browser. Drop files in a directory, read them from anywhere. Supports EPUB, PDF, and plain text.

## Architecture

```
┌─────────┐     ┌──────────┐     ┌──────────┐
│  Vite   │────▶│ Express  │────▶│ SQLite   │
│  (Vue)  │◀────│  (API)   │◀────│  (data)  │
└─────────┘     │          │     └──────────┘
                │  ┌──────┐│     ┌──────────┐
                │  │multer││────▶│  books/   │
                │  └──────┘│     │ (files)  │
                └──────────┘     └──────────┘
```

- **Frontend**: Vue 3 + Vue Router + Pinia + Tailwind CSS
- **Backend**: Express 5 + better-sqlite3 — serves the SPA and REST API from a single process
- **Storage**: Books live on the filesystem (`books/`), metadata in SQLite (`data/jabr.sqlite3`)
- **Reader**: epub.js for EPUBs, pdf.js for PDFs, iframes for text files

No PostgreSQL. No PostgREST. No nginx reverse proxy. No container orchestration platform that needs its own dedicated SRE team. Just `node` and a file descriptor or two.

## Quick Start

```sh
pnpm install
pnpm dev
```

Opens at `http://localhost:5173` with the API proxied to `http://localhost:3001`.

For production:

```sh
pnpm build
NODE_ENV=production node dist/server/index.js
```

Or via Docker:

```sh
podman compose up -d
```

Hits `http://localhost:8080`.

## Configuration

| Env | Default | Description |
|---|---|---|
| `JABR_PORT` | `3001` | HTTP port for the API server |
| `JABR_DB_PATH` | `./data/jabr.sqlite3` | Path to SQLite database |
| `JABR_BOOKS_PATH` | `./books` | Directory containing book files |
| `NODE_ENV` | `development` | Set to `production` to serve the built SPA |

## API

All endpoints live under `/api`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/books` | Scan filesystem and return indexed books |
| `GET` | `/api/books/search?q=` | Search by title or author |
| `GET` | `/api/book/:path` | Serve book file |
| `POST` | `/api/upload` | Upload a book (multipart form) |
| `GET` | `/api/profiles` | List reading profiles |
| `POST` | `/api/profiles` | Create a profile |
| `GET` | `/api/progress/:bookId` | Get reading progress |
| `PUT` | `/api/progress/:bookId` | Save reading progress |
| `GET` | `/api/settings` | Get all settings |
| `POST` | `/api/settings` | Save settings |
| `DELETE` | `/api/settings` | Reset database (irreversible) |
| `POST` | `/api/login` | Authenticate |
| `DELETE` | `/api/login` | Deauthenticate |
| `GET` | `/api/login/status` | Check if auth is enabled |
| `GET` | `/api/export` | Download full backup (JSON) |
| `POST` | `/api/migrate` | Import from Calibre library |
| `GET` | `/api/health` | Returns `{"status":"ok"}` |

## Calibre Migration

Two paths:

1. **CLI** — `pnpm migrate --library /path/to/calibre/library`
2. **Settings page** — "Migrate from Calibre" wizard with preview and execute steps

Both copy files from the Calibre directory structure into `books/` using `Author - Title.ext` naming. Run it against multiple libraries — it's additive. Identical filenames skip silently.

## Development

```sh
pnpm dev      # frontend + backend with hot reload
pnpm build    # type-check + build both
pnpm lint     # eslint + oxlint
pnpm format   # oxfmt
```

`server/` is vanilla TypeScript compiled with `tsc`. `src/` is Vue SFCs compiled with `vue-tsc` + `vite`.

## Deployment

The Dockerfile does a multi-stage build:

1. Install deps, compile TypeScript, build the Vue SPA
2. Copy only the artifacts into a fresh `node:22-alpine` image
3. `CMD ["node", "dist/server/index.js"]`

The `compose.yml` mounts `data` and `books` volumes for persistence.

## Why not PostgreSQL?

Because this app has five tables and zero relationships worth indexing. SQLite is a single file, needs no daemon, survives `podman compose down` without a pg_dump ritual, and handles the workload of one user reading books without breaking a sweat.

The original version used PostgreSQL + PostgREST. It worked. It was also complete overkill — like using a cargo ship to cross a pond. We drained the pond and built a bridge instead.

## License

AGPL-3.0-or-later
