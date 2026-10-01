# JABR: Progress Report

> *The following is a record of what we actually built, not what we planned to build before we realized that PostgreSQL for a single-user book reader is like hiring a cargo ship to cross a pond.*

## Phase 1: Project Foundation
- [x] 1.1 Scaffold Vue + TS project (`pnpm create vite` — the old ways still work)
- [x] 1.2 Install dependencies (pnpm resolved the dependency tree before npm finished reading `package.json`)
- [x] 1.3 Vite configuration (tailwindcss plugin, `/api` proxy to Express)
- [x] 1.4 TypeScript configuration (tsconfig references because one tsconfig.json is never enough)
- [x] 1.5 Tailwind CSS 4 theme (coffee & parchment palette, dark mode, custom fonts)
- [x] 1.6 Environment variables (`.env` exists, is gitignored, doesn't need a dedicated YAML parser)

## Phase 2: Port the Backend (Express + SQLite)
- [x] 2.1 Express 5 server with REST API routes
- [x] 2.2 better-sqlite3 database with auto-schema on startup
- [x] 2.3 Book filesystem scanner with caching (because rescanning 500 books on every request is for masochists)
- [x] 2.4 Multer upload endpoint (512MB max, filetype whitelist, sanitized filenames)
- [x] 2.5 ~~Auth system~~ — **removed on purpose.** See "Why no auth?" below.
- [x] 2.6 Calibre migration (CLI + API, reads metadata.db directly, no Calibre runtime needed)

### Deviations from (unwritten) plan
- We kept SQLite instead of migrating to PostgreSQL. See the README's "Why not PostgreSQL?" section for the full rant.
- We kept Express instead of PostgREST. Writing CRUD routes manually takes about 40 minutes and removes an entire container from the stack. Worth it.
- The `pnpm migrate` CLI script reads Calibre's `metadata.db` directly and copies files to `books/`. This is simpler and doesn't require PostgreSQL to be running.

## Phase 3: Frontend - API Layer
- [x] 3.1 API client composable (`useApi` — thin fetch wrapper, no GraphQL, no tRPC, no OpenAPI codegen)
- [x] 3.2 Books API composable (list, search, serve file)
- [x] 3.3 Progress API composable (get by profile+book, upsert)
- [x] 3.4 Profiles API composable (list, create)
- [x] 3.5 Settings API composable (get, save, reset)
- [x] 3.6 ~~Auth API composable~~ — removed with the rest of the login system.
- [x] 3.7 Export/Migration API composable (backup download, Calibre import)

### Deviations from plan
- Didn't need PostgREST client at all. The Express API exposes conventional REST endpoints. This is fine.
- Added dedicated composable files per domain (`useBooksApi`, `useProgressApi`, etc.) instead of one monolithic `usePostgrest`. Single-responsibility principle, grandpa style.

## Phase 4: Frontend - Pinia Stores
- [x] 4.1 Books store (fetch, search, sort — all client-side because 500 books sorted on the server is a solved problem that doesn't need solving)
- [x] 4.2 Profiles store (list, create, active profile persistence in localStorage)
- [x] 4.3 Progress store (fetch per book, save with debounce, "currently reading" getter)

### Deviations from plan
- No PostgREST client. Stores talk to Express endpoints via composable wrappers.
- Progress debounce lives in `BookReader.vue` (750ms) rather than the store. The store is just a write-through cache — the component controls flush timing.
- Added error states to all stores. Because networks fail, and pretending otherwise is for people who don't actually ship software.

## Phase 5: Frontend - Components
- [x] 5.1 `BookCard.vue` — Grid card with title, author, format badge, size, progress bar
- [x] 5.2 `SearchBar.vue` — v-model search input (no debounce — client-side filtering is instant. Go ahead, type fast.)
- [x] 5.3 `SortControls.vue` — Sort by title/author/size/mtime, ascending/descending toggle
- [x] 5.4 `CurrentlyReading.vue` — Active book widget with progress bar and continue/stop buttons
- [x] 5.5 `BookReader.vue` — EPUB.js / pdfjs-dist / iframe renderer with progress restoration

### Deviations from plan
- `BookCard` progress prop is `number | null | undefined` because JavaScript is what it is.
- `SearchBar` doesn't debounce because client-side filtering is instant and adding a debounce to an instant operation is cargo-cult engineering.
- `BookReader` generates canvas elements for each PDF page instead of using a single canvas with page swapping. It's more DOM nodes but simpler scroll-based position tracking.
- Added proper loading, error, and empty states to everything. Because "it just works" means "it handles all states."

## Phase 6: Frontend - Pages
- [x] 6.1 Vue Router configuration (3 routes: library, reader, settings)
- [x] 6.2 `App.vue` — Root wrapper with `<RouterView>`
- [x] 6.3 `LibraryPage.vue` (/) — Book grid with search, sort, progress indicators
- [x] 6.4 `ReaderPage.vue` (`/read/:id`) — Full-screen reader with dark theme
- [x] 6.5 `SettingsPage.vue` (`/settings`) — Profile management, Calibre migration UI

### Deviations from plan
- LibraryPage fetches profiles and books in parallel with `Promise.all`. Sequential fetching was for dial-up.
- ReaderPage fetches book content as ArrayBuffer, creates a Blob URL. No streaming, no Range requests, no partial content negotiation. It's a book — the whole thing fits in memory.
- SettingsPage has inline profile management (create, select, no delete because we're not monsters).
- All pages have error states, loading states, and empty states. Yes, even the settings page.

## Phase 7: Build & Deploy
- [x] 7.1 Package.json scripts (`dev`, `build`, `lint`, `format`, `migrate`, `db:dev:up/down`)
- [x] 7.2 Production build (`vite build` + `tsc -p server/`)
- [x] 7.3 Multi-stage Dockerfile (build → runtime, node:22-alpine both stages)
- [x] 7.4 Docker Compose (`compose.yml`, port 8080, named volumes)
- [x] 7.5 Nginx config (for alternative deployment with PostgREST — not the default)

### Deviations from plan
- The "Vue port plan v2" specified PostgreSQL + PostgREST. Ignored. The Express + SQLite stack runs in a single container, has zero networking between services, and doesn't require a PhD in container orchestration to maintain.
- No `compose.prod.yml` — the main `compose.yml` handles production. One file is enough.
- Build uses `run-p type-check "build-only"` (parallel) because sequential builds are for people with more time than CPU cores.
- Added `lint` and `format` scripts because writing clean code is a team sport even when the team is just you.
- Added `migrate` script (`pnpm migrate --library /path/to/calibre/library`) for CLI-driven Calibre import.

## Phase ∞: Things We Will Probably Never Do

| Feature | Likelihood | Reasoning |
|---------|-----------|-----------|
| PostgreSQL support | Near zero | See "Why not PostgreSQL?" in the README |
| OAuth/SSO integration | Zero | Deleted the login system on purpose. Use your tailnet, not a password. |
| Kubernetes helm chart | Zero | If you're deploying a book reader to Kubernetes, you've lost the plot |
| AI-powered recommendation engine | Negative | The app can't even recommend a book because *that's your job* |
| EPUB annotation support | Low | epubjs supports it, but implementing annotation storage requires thought |
| WASM-based reader for everything | Low | pdfjs-dist already handles PDFs and it's written in... not WASM |
| Full-text search across books | Medium | Would require content extraction and indexing, but it would be genuinely useful |
| Mobile app | Zero | It's a PWA-capable SPA. Add it to your home screen and move on with your life. |

## Key Design Decisions (and the arguments we had with ourselves)

### Why a single Express process instead of PostgREST?

PostgREST is neat. It generates a REST API from your PostgreSQL schema. It also adds a container, a network hop, and an authentication layer to an app that needs none of those things. Express middleware takes about three lines to add CORS, JSON parsing, and auth checking. The whole API layer is ~250 lines of TypeScript vs. ~20 lines of PostgREST config + PostgreSQL setup. The Express version wins on simplicity because it removes an entire service.

### Why SQLite instead of PostgreSQL?

Asked and answered. But in short: five tables, one user, no concurrent writes. SQLite handles this workload with the enthusiasm of a golden retriever fetching a stick. PostgreSQL handles this workload with the solemn dignity of a mainframe operator who was told there's a slight breeze in the data center.

### Why no auth?

Because this runs on a trusted internal network and is never exposed to the internet, and because publicly serving a library of copyrighted books is a legal mess we would rather not invite.

There *was* a login system: a login page, a cookie, a router guard and an `authEnabled` setting. It was removed rather than finished, for one specific reason — the server never verified the cookie, so enabling "auth" restricted the UI while leaving every API endpoint wide open. That is worse than no auth, because it looks like a security boundary.

Reader profiles remain, and they are not security: they exist so two people (or one person with two moods) keep separate reading positions.

If you need remote access, terminate it in WireGuard/Tailscale or an authenticating reverse proxy. The app stays dumb on purpose.

### Why client-side search and sort?

The entire book collection is ~500 entries. Fetching them all once (one network round trip) and filtering/sorting locally is faster than making the user wait for a server round trip on every keystroke. This stops being true at about 10,000 books. If you have 10,000 books in your personal library, congratulations — you don't need a better search algorithm, you need an intervention.

## What's Next

- ~~PostgreSQL + PostgREST port~~ — Nope. Scratch that. We built the thing that works.
- NixOS module — Maybe. When someone actually needs to deploy this on NixOS, we'll write it. Until then, `podman compose up -d` is fine.
- EPUB annotation support — Could happen. epubjs exposes annotation events. Just needs a data model and a UI.
- Theming engine — Users keep asking for custom color schemes. Tailwind makes this trivial once we decide on the API.
- Offline PWA support — `vite-plugin-pwa` would handle this. Low priority because we're never *not* on WiFi.

---

*The previous plan (vue-nuxt-port-plan-v2.md) specified PostgreSQL + PostgREST. It was aspirational. This is what we actually built. Aspirations are fine, but working software is better.*
