# JABR Vue Port - Progress Tracker

## Phase 1: Project Foundation
- [x] 1.1 Scaffold Vue + TS project
- [x] 1.2 Install dependencies
- [x] 1.3 Vite configuration (tailwindcss plugin, /api proxy)
- [x] 1.4 TypeScript configuration
- [x] 1.5 Tailwind CSS 4 theme (fonts, color palette, dark mode)
- [x] 1.6 Environment variables (.env, gitignored)

## Phase 2: PostgreSQL Schema
- [x] 2.1 Database schema (db/init.sql)
- [x] 2.2 Binary content streaming RPC function
- [x] 2.3 Default seed data (db/seed.sql)

## Phase 3: Container Stack
- [x] 3.1 Podman Compose (postgres + postgrest)
- [x] 3.2 PostgREST config — skipped, env vars in compose suffice
- [ ] 3.3 Verify stack runs and test binary streaming RPC

### Deviations from plan
- `db/seed.sql` mounted as `02-seed.sql` in initdb.d so default profile
  is created automatically on first start (plan had seed run manually)
- `postgrest.conf` omitted — compose env vars cover all settings

## Phase 4: Calibre Import/Conversion Script
- [x] 4.1 Migration script structure (scripts/migrate-calibre.ts)
- [ ] 4.2 Test migration against local DB

### Deviations from plan
- Added `tsx` as dev dependency for running TypeScript scripts
- Added `migrate` script to package.json (`pnpm migrate`)

## Phase 5: Frontend - API Layer
- [x] 5.1 PostgREST client (thin fetch wrapper)
- [x] 5.2 Books API
- [x] 5.3 Progress API
- [x] 5.4 Profiles API

### Deviations from plan
- Added `upsert` method to PostgREST client using `Prefer: resolution=merge-duplicates`
  for true insert-or-update (plan used PATCH which assumes row exists)
- Progress API now uses `upsert` instead of `patch` for saving progress
- Created `src/types/index.ts` with `Book`, `BookProgress`, `Profile` interfaces

## Phase 6: Frontend - Pinia Stores
- [x] 6.1 Books store
- [x] 6.2 Profiles store
- [x] 6.3 Progress store

### Deviations from plan
- **Client-side filtering/sorting**: The plan had server-side sort with client-side search, plus `setSearch/setSort/toggleOrder` calling `fetchBooks()` on every change. Stores now do fully client-side sorting and search — setters are local-only, the `filteredBooks` getter recomputes automatically. No unnecessary server roundtrips.
- **`upsert` call fixed**: Plan passed 3 args (`upsert(profileId, bookId, data)`) but the actual API takes a single object. Corrected.
- **`activeBookId` removed**: Was declared but unused in the plan. Stripped.
- **Error handling added**: `fetchProfiles` now has `error` state + try/catch, matching `fetchBooks` pattern.
- **`loadSavedProfile` integrated**: Replaced by `_restoreActiveProfile()` called at end of `fetchProfiles` — eliminates the coordination gap where `loadSavedProfile` might run before profiles are loaded.

## Phase 7: Frontend - Components
- [x] 7.1 BookCard.vue
- [x] 7.2 SearchBar.vue
- [x] 7.3 SortControls.vue
- [x] 7.4 CurrentlyReading.vue
- [x] 7.5 BookReader.vue

### Deviations from plan
- **SearchBar**: Dropped debounce and `search` emit. Client-side filtering is instant — `v-model` directly on `<input>` suffices, no server calls to throttle. The plan's dual emit + `:value` pattern would have made the input appear unresponsive.
- **BookCard**: `progress` prop simplified from `{ percent: number } | null` to `number | undefined`. Parent passes `progressStore.forBook(id)?.percent`.
- **SortControls**: Added `setOrder` action to books store for `v-model:order` binding.
- **BookReader**: Fixed PDF rendering (added canvas generation for each page), fixed epubjs rendition types, added loading/error states, added `initialLocation`/`initialPercent` props for progress restoration, removed unused `containerWidth` state.

## Phase 8: Frontend - Pages
- [x] 8.1 Vue Router configuration
- [x] 8.2 App.vue
- [x] 8.3 LibraryPage.vue (Home)
- [x] 8.4 ReaderPage.vue
- [x] 8.5 SettingsPage.vue

### Deviations from plan
- **LibraryPage**: Added missing component imports (BookCard, SearchBar, SortControls). Fixed SearchBar to use only `v-model` (no `@search` emit — dropped in Phase 7). Fixed SortControls to use `v-model:sort` / `v-model:order` with `storeToRefs` refs (removed inline `($v: any)` handler). Fixed BookCard `:progress` to pass `?.percent` (number) instead of `BookProgress` object. Changed sequential `fetchProfiles().then(fetchBooks)` to parallel `Promise.all`.
- **ReaderPage**: Added `error` state + `catch` block. Passes `initialLocation` and `initialPercent` props to BookReader for progress restoration. Moved `useProfilesStore()` to setup level. Removed dead `saveInterval` + empty `saveCurrentProgress()` (BookReader's debounced `progress` emit handles saving).
- **SettingsPage**: Added `loading`/`error` states from profiles store. Added empty state if no profiles.
- **App.vue**: Added `min-h-screen bg-parchment text-coffee` wrapper div. Kept PascalCase `RouterView` import.
- **Router**: Uses `createWebHistory(import.meta.env.BASE_URL)` for Vite path compatibility.

## Phase 9: Build & Deploy
- [x] 9.1 Package.json scripts (added db:up, db:down)
- [x] 9.2 Production build (pnpm build works, outputs dist/)
- [ ] 9.3 NixOS module (future — deferred until deployment needed)

### Deviations from plan
- **Build script**: Uses `run-p type-check "build-only"` (parallel) instead of sequential `vue-tsc && vite build`. Type-check runs in project-references mode (`vue-tsc --build`) — the plan's `--noEmit` doesn't work with tsconfig references.
- **Additional scripts**: Added `lint`, `lint:oxlint`, `lint:eslint`, and `format` scripts for code quality (oxlint, eslint, oxfmt).
- **9.3 NixOS**: Deferred indefinitely — the current compose stack (Podman) is sufficient for development and testing. NixOS module can be added when production deployment is needed.
