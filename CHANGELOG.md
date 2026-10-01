# Changelog

Notable changes, newest first. This project follows [Semantic Versioning](https://semver.org/).

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
  Profiles are a reading-state selector, not a security boundary.
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
