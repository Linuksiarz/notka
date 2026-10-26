# Architecture

## Runtime shape

```
┌───────────────────────────────────────────────────────────┐
│  Single container (Dockerfile)                            │
│                                                           │
│  Ktor/Netty :8080                                         │
│   ├── /api/**        JSON API   (backend/)                │
│   └── /**            SPA assets (frontend/dist, copied)   │
│                                                           │
│  SQLite file  /data/notka.db   (volume in compose)     │
└───────────────────────────────────────────────────────────┘
```

One process serves both the API and the compiled Svelte bundle. There is no nginx and no CORS
configuration: the browser always talks to the same origin. In development Vite runs on `:5173`
and proxies `/api` to `:8080`, so the same same-origin assumption holds.

The Android app (`apk/`, see its README) keeps that assumption too: it is a WebView that loads the
reader's own server, so the page, its cookie and its service worker are the server's exactly as in a
browser. What it adds is native — the page drawn under the system bars, the status bar's icons, Back —
and the frontend reaches it only through Capacitor's bridge.

## Backend layers (Entity – Control – Boundary)

```
boundary/http/     Ktor plugins, routes, request/response DTOs, HTTP status mapping
   ↓
control/           business rules (access checks, trash policy)
   ↓
entity/model/      domain types: User, Note, Label, NoteShare, NoteAppearance, NoteDocument
entity/persistence/ Exposed queries, one repository per aggregate, tables, schema bootstrap
```

Package layout:

```
dev/duwe/notka/
├── NotkaApplication.kt      entrypoint + composition root (config → boundary → control → entity)
├── entity/model/               ErrorKind/DomainException, entities, NoteDocument, validation
├── entity/persistence/         Database, Migrations, Exposed tables, *Repository
├── control/                    AuthService, NoteService, SharingService, LabelService,
│                               PasswordHasher, TrashCleanupJob
└── boundary/config/            AppConfig (environment)
    boundary/http/dto/          wire DTOs and mappers
    boundary/http/plugins/      ContentNegotiation, StatusPages, CallLogging, cookies, SPA
    boundary/http/routes/       AuthRoutes, NoteRoutes, LabelRoutes, EventRoutes, HealthRoutes
```

Rules:

- **Boundary never touches Exposed.** Routes translate HTTP to control calls and results to DTOs.
- **Control owns access control.** Every note-facing service function takes the acting `userId`
  first and re-checks ownership or share permission; a `noteId` from a client is never trusted.
- **Repositories are dumb.** They run the query they are asked to run; they do not enforce access.
- `entity` imports nothing from `control` or `boundary`; `control` imports nothing from `boundary`;
  only the boundary knows about HTTP status codes.
- Failures are thrown as `DomainException(kind, key, params, message)` and rendered centrally by
  the `StatusPages` plugin, which maps `kind` to the HTTP status and the documented `code`.

### Startup sequence

1. Read configuration from environment variables (see below).
2. Apply the schema (`CREATE TABLE IF NOT EXISTS` bootstrap — on every start, not only when the file is empty).
3. `Database.connect(...)` over a HikariCP pool, with WAL, `busy_timeout=5000`, `foreign_keys=on`.
4. Start the trash cleanup job.
5. Install plugins and routes, start Netty.

### Trash cleanup job

A coroutine on `Dispatchers.IO` launched at startup:

- runs once immediately, then every 6 hours;
- `DELETE FROM notes WHERE trashed_at IS NOT NULL AND trashed_at < now - 30 days`;
- cascades remove shares, version snapshots and note-label links;
- failures are logged and the loop continues; a failed run never crashes the server.

`NOTKA_TRASH_RETENTION_DAYS` overrides the 30-day default (used by tests).

## Configuration

All configuration comes from environment variables; every one has a working default so the
container needs no configuration to boot.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOTKA_PORT` | `8080` | HTTP port |
| `NOTKA_HOST` | `0.0.0.0` | Bind address |
| `NOTKA_DB_PATH` | `./data/notka.db` | SQLite file (created on demand) |
| `NOTKA_STATIC_DIR` | `./static` | Directory holding `index.html` and hashed assets |
| `NOTKA_SESSION_TTL_DAYS` | `30` | Session lifetime, refreshed on each authenticated request |
| `NOTKA_COOKIE_SECURE` | `false` | Set `true` behind HTTPS (`docker-compose.yml` does) |
| `NOTKA_AUTH_ATTEMPTS_PER_MINUTE` | `10` | Sign-in and registration attempts per client address per minute (`429 request.too_many` beyond it); the e2e suites run with a high value |
| `NOTKA_TRUST_PROXY_HEADERS` | `false` | Read the client address from the last `X-Forwarded-For` hop. Only when a reverse proxy is the only thing that can reach the app (`docker-compose.yml` binds to loopback and sets it) |
| `NOTKA_TRASH_RETENTION_DAYS` | `30` | Days a note may stay in the trash |
| `NOTKA_MAX_NOTE_BYTES` | `65536` | Reject larger note documents |
| `NOTKA_ADMIN_USERNAME`, `NOTKA_ADMIN_PASSWORD` | – | The administrator, created on the **first start** of an instance that has none (required then, and refused to start without). Ignored — with a warning in the log — on every later start |
| `NOTKA_ADMIN_EMAIL` | – | Optional address for that administrator, read with the two above |
| `NOTKA_PUBLIC_URL` | – | The address users reach the instance at, e.g. `https://notes.example.com`; links in e-mails are built from it, never from a request's `Host` |
| `NOTKA_SMTP_HOST` | – | Outgoing mail server; without it no e-mail is sent and password resets are unavailable |
| `NOTKA_SMTP_SECURITY` | `starttls` | `starttls` (port 587), `force_tls` (465) or `off` (25) — Vaultwarden's names |
| `NOTKA_SMTP_PORT` | by security | |
| `NOTKA_SMTP_USERNAME`, `NOTKA_SMTP_PASSWORD` | – | Login at the mail server, when it wants one |
| `NOTKA_SMTP_FROM`, `NOTKA_SMTP_FROM_NAME` | –, `Notka` | Sender; `NOTKA_SMTP_FROM` is required with `NOTKA_SMTP_HOST` |
| `NOTKA_SMTP_TIMEOUT` | `15` | Seconds before a silent mail server counts as failed |
| `NOTKA_MAX_IMAGE_STORAGE_MB` | `1024` | Picture storage of the notes one account owns, in MB (`403 image.storage_full`) |
| `NOTKA_MAX_NOTES_PER_USER` | `10000` | Notes one account may own, trash included (`403 note.limit_reached`) |
| `NOTKA_LOG_LEVEL` | `INFO` | Logback root level |
| `DEMO` | `false` | Seed two sample accounts with demo notes and offer them on the sign-in screen; Alice is the administrator, so no `NOTKA_ADMIN_*` is needed. Deliberately not an `NOTKA_*` name: it is a switch a demo instance sets, not a deployment setting |

Whether sign-up is open and which background theme is the default are **not** environment settings:
the administrator changes them at run time in the server settings, and they live in
`server_settings`. Sign-up starts closed.

## Frontend architecture (Entity – Control – Boundary)

```
src/
├── main.ts                   mounts App.svelte, registers the service worker in production
├── entity/                   pure domain layer: no DOM, no fetch
│   ├── api/types.ts          wire types (mirror of docs/API.md)
│   ├── noteDocument.ts       NoteDocument helpers (create, normalize, compare, plain text)
│   ├── markdown.ts           Markdown ⇄ NoteDocument: block/inline parsing + the export renderer
│   ├── locales.ts            supported locale codes and Accept-Language matching
│   ├── noteOrder.ts          the order a view shows its notes in (pinned, then position)
│   ├── masonry.ts            Keep's grid: each note into the shortest column
│   ├── pendingChanges.ts     a note as it will be once its waiting writes are stored
│   ├── sharedNote.ts         what another app shared (title, text, url) as a new note
│   └── format.ts             locale-free date calculations (days until purge)
├── control/                  application layer: no DOM, no Svelte components
│   ├── api/                  typed fetch client (client.ts, auth.ts, notes.ts, labels.ts) and
│   │                         localStore.ts (this device's copy, IndexedDB), shareInbox.ts (a share
│   │                         the service worker kept, Cache Storage)
│   ├── receiveShare.ts       a waiting share → create, add, pictures
│   ├── state/                *.svelte.ts rune stores: session, notes, labels, ui, connection,
│   │                         pendingWrites (the writes waiting for the server)
│   └── router.svelte.ts      ~90-line history-API router
└── boundary/                 adapters to the outside world
    ├── App.svelte            shell: sidebar + top bar + route outlet + dialogs
    ├── routes/               one component per view
    ├── components/           presentational components
    ├── editor/               the editor's own modules: listRows.ts (flat checklist rows and their
    │                         Tab/Shift+Tab level), draggingRow.ts (what a drag draws),
    │                         checklistCompletion.ts + completedSection.ts (completed items),
    │                         noteDraft.svelte.ts (what is typed vs what is stored),
    │                         editorFlight.ts (the editor's animations)
    ├── i18n/                 message catalogues, `t()`, `tError()`, localized formatters
    └── styles/               tokens.css, palette.css, global.css
```

- **State lives in `.svelte.ts` modules** using `$state`. Components read and write them; there is
  no prop-drilling of collections. Stores never produce user-facing text — the boundary decides
  what to tell the user — which is what keeps `control` free of i18n.
- **The router is hand-rolled** (history API + `popstate`). Routes: `/`, `/archive`, `/trash`,
  `/reminders`, `/labels/{id}`, `/settings`, `/share`, `/login`, `/register`. Keep's well-known URLs are reproduced
  (e.g. `/archive`); the Ktor SPA fallback makes them survive a hard refresh.
- **Markdown is a two-way mapping over `NoteDocument`**, implemented once in `entity/markdown.ts`:
  `documentToMarkdown(document, headingOffset)` and `noteToMarkdown(note)` are the export feature,
  written and unit tested today so the format promise in `AGENTS.md` stays verifiable.
- **The body is edited with Tiptap** (`boundary/components/RichText.svelte`), so the contenteditable
  engine — line splitting, list behaviour, checkboxes, keyboard shortcuts, "format as you type",
  undo history, paste reduction — is the library's rather than ours. `entity/tiptapDocument.ts`
  translates between the stored `NoteDocument` and the ProseMirror document in both directions, and
  the two shapes now agree line for line: **a list is flat on both sides**, one item per line carrying
  its own `depth` (`boundary/editor/listRows.ts`), so nothing has to be flattened on the way in or
  out. `NoteDocument` stays the only shape we persist, which keeps the Markdown export and the version
  guard reading one format. Carrying a row with its six-dot handle is ours, not the library's: the
  list is measured once, the row is drawn under the hand while the document is untouched, and the drop
  writes the arrangement that is already on screen.
- **Popovers** (colour picker, label picker, menus) use the `floatingPanel` action, which switches
  them to `position: fixed` and clamps them into the viewport. Without it a 372 px palette panel
  would be clipped by the card's `overflow: hidden` and slide under the sidebar.
- **i18n**: `t()` reads the reactive `ui.locale`, so switching language re-renders every component
  without a reload. Catalogues are keyed off `en-US`, and a missing key is a compile error.
  See `docs/I18N.md`.
- **PWA**: `public/manifest.webmanifest` + a hand-written runtime-caching `public/sw.js`. No service
  worker plugin and no precache manifest to keep in sync with the Vite build.
- **Share target**: the manifest's `share_target` puts the installed app in the system's *Share*
  sheet as a `POST /share` (multipart: `title`, `text`, `url`, `images`). No server answers it — the
  service worker keeps the share in Cache Storage (`notka-v1-share`) and redirects to `GET /share`,
  so it works offline and a reload does not share twice. Once somebody is signed in, `App.svelte`
  takes it out (`control/receiveShare.ts`): the text becomes a text note through the ordinary
  `create` + `add` (queued with a local id offline, rule 25 of `AGENTS.md`), the pictures go through
  the ordinary upload, one by one (online only — offline the note is kept without them and the
  reader is told), and the note opens in the editor.

## Explicitly out of scope (do not build)

| Feature | Seam left in place |
| --- | --- |
| Pictures | Implemented: `note_images`, `/api/notes/{id}/images`, `NoteImages` / `ImageViewer`. Drawings and voice notes are not |
| Link previews | **Implemented.** The urls are read out of the document (`LinkPreviewService.extract`), fetched through a guarded client and cached in `link_previews`; no url is ever stored beside the note, so removing a link removes its card |
| Reminders | Implemented: `reminder_at`/`reminder_repeat` on the note, set through `PATCH`, gathered by `GET /api/notes?reminders=true` |
| Label filtering | `GET /api/notes?labelId=` narrows a view to the notes carrying that label; labels stay per-user |
| Note search | Top bar filters the already-loaded note list client-side only |
| Real-time collaboration | no WebSocket layer; saves are last-write-wins |
| Markdown export & import | In the browser, no HTTP endpoint of its own: `entity/noteFile.ts` writes and reads the file format (`docs/MARKDOWN.md`) on top of `entity/markdown.ts`; `boundary/download.ts` saves `.md`/`.zip` and reads picked files; `control/importNotes.ts` creates the notes through the ordinary REST calls |
