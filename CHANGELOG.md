# Changelog

Notable changes, newest first. This project follows [Semantic Versioning](https://semver.org/).

## 0.1.0-beta.2

Everything in beta.1 plus the fixes below. If you are running beta.1, upgrade —
its container image predates the starter profile, so reading progress went
nowhere until you created a profile by hand.

### Added

- **A fresh install starts with a reading profile called "Me"**, renameable in
  Settings (or via `PATCH /api/profiles/:id`) instead of silently discarding
  progress until you created one yourself. `POST /api/profiles/default` is
  idempotent, so it is safe to call on every load.
- **Hiding a book instead of deleting it.** *Hide* on any card removes it from
  the library without touching the file, and Settings → *Hidden books* restores
  it. The app never deletes your books.

### Fixed

- **Kubernetes backup CronJob failed outright.** The script was mounted at
  `/scripts`, so `require('better-sqlite3')` walked up from the wrong directory
  and the job died with `MODULE_NOT_FOUND`. Found by applying the manifests to a
  live cluster; verified afterwards with an in-cluster `integrity_check` on the
  dump.
- **Absent reading progress returned 404**, logging a console error on the first
  read of every book. It is a normal state, so the endpoint now answers `null`.
- **Opening a book by direct URL never loaded profiles**, so progress was
  silently neither restored nor saved for deep links, bookmarks and reloads.
- **`pnpm build-only` deleted the server bundle.** Vite empties its `outDir`,
  which took `dist/server/index.js` with it and left `pnpm start` unable to find
  its entry point. `emptyOutDir` is now off, and `pnpm clean` exists for when you
  do want `dist/` gone.
- **Text and Markdown are rendered in a sandboxed iframe**, and PDF/EPUB readers
  now tear down their observers and listeners when unmounted.

### Deployment notes

- The container runs as uid 1000, needs a writable `/app/data`, and works with a
  read-only root filesystem.
- **Put the `data` volume on block or local storage, not NFS.** SQLite in WAL
  mode needs shared memory and working POSIX locks; network filesystems provide
  neither reliably, which risks corruption. The `books` volume is read-mostly
  and is fine on RWX NFS.
- Verified on Talos v1.14.2 / Kubernetes v1.37: rollout, PVC binding, security
  context, probes, the backup job, and the browser suite end to end.

## 0.1.0-beta.1

First beta. JABR is a self-hosted e-book reader for a trusted internal network:
point it at a folder of books, read them in a browser, keep your place per reader
profile. EPUB via epub.js, PDF via pdf.js, plain text and Markdown as-is.

### What works

- **Library** — recursive filesystem scan with SQLite-backed index, client-side
  search and sorting, upload of single files or whole folders from the browser.
- **Reading** — EPUB, PDF and text readers with progress tracked per profile and
  restored on reopen, including when a book is opened directly by URL.
- **Profiles** — separate reading positions for different people (or moods).
  A fresh install starts with one called *Me*, renameable in Settings. Profiles
  are a reading-state selector, not a security boundary.
- **Deployment** — single container, unprivileged, ~182 MB; Compose file and
  Kubernetes manifests with probes, persistent volumes and a nightly backup
  CronJob. Graceful shutdown on `SIGTERM`.

### Deliberately not included

- **Authentication.** There is none, by decision. JABR is meant for a LAN, a
  tailnet, or behind a proxy that already does this. Do not expose it to the
  internet.
- **Book deletion from the UI.** Removing a book means removing the file from
  the books directory; there is no delete button yet.
- **Calibre import.** Removed in favour of "files go in a folder". Calibre's
  *Save to disk* with the template `{authors} - {title}` produces the layout
  JABR reads.

### Infrastructure

- Server code is bundled with esbuild into a single file; the runtime image
  ships only that bundle plus the native `better-sqlite3` module.
- Dead weight removed: Calibre importer (~400 lines), the half-implemented login
  system, and the settings subsystem that had no remaining consumers.
