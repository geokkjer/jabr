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
- [ ] 5.1 PostgREST client (thin fetch wrapper)
- [ ] 5.2 Books API
- [ ] 5.3 Progress API
- [ ] 5.4 Profiles API

## Phase 6: Frontend - Pinia Stores
- [ ] 6.1 Books store
- [ ] 6.2 Profiles store
- [ ] 6.3 Progress store

## Phase 7: Frontend - Components
- [ ] 7.1 BookCard.vue
- [ ] 7.2 SearchBar.vue
- [ ] 7.3 SortControls.vue
- [ ] 7.4 CurrentlyReading.vue
- [ ] 7.5 BookReader.vue

## Phase 8: Frontend - Pages
- [ ] 8.1 Vue Router configuration
- [ ] 8.2 App.vue
- [ ] 8.3 LibraryPage.vue (Home)
- [ ] 8.4 ReaderPage.vue
- [ ] 8.5 SettingsPage.vue

## Phase 9: Build & Deploy
- [ ] 9.1 Package.json scripts
- [ ] 9.2 Production build
- [ ] 9.3 NixOS module (future)
