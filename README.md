<div align="center">

# Notka

**A free, self-hosted notes app in the spirit of Google Keep.**

Notes, checklists, labels, sharing, colors and backgrounds — running on your own server,
in your own database, under your own control.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

</div>

![Notka notes grid](docs/images/notes-dark.jxl)

> Notka is an independent open-source project. It is **not** affiliated with, endorsed by, or
> connected to Google in any way. Only the look and feel are intentionally familiar.

Where Notka deliberately differs from the original — Markdown in the editor, colours shared with
collaborators, Markdown export, view-only sharing and more — is listed in
[`docs/DIFFERENCES.md`](docs/DIFFERENCES.md).

---

## Features

| | |
| --- | --- |
| 📝 **Two note types** | Free-form text notes and checkbox lists, switchable after the fact. |
| 🎨 **Appearance** | 11 colors and 9 backgrounds per note, each background with a light and a dark variant, and the two are independent choices: a background keeps the color it was picked with. Plus a dark theme for the whole app. |
| 🖼️ **Background themes** | The backgrounds' pictures are a theme: Notka's own CC0 artwork built in, and any theme you import as a `.zip` — the original's illustrations are one, kept outside the app in `themes/google-keep/` ([`docs/THEMES.md`](docs/THEMES.md)). |
| ⌨️ **Markdown as you type** | `# `, `## `, `### `, `- `, `* `, `1. `, `[ ] ` at line start; `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, links inline. |
| 🏷️ **Labels** | Per-user labels you can attach to any note — or type `#` in a note and pick one from the suggestions — and a label's own view filters the notes that carry it. |
| 👥 **Sharing** | Share a note with another account as *view only* or *can edit*. |
| 🔄 **Live updates** | When a collaborator edits a shared note, your list and an open note follow along on their own — no refresh. |
| 🛡️ **Nothing typed is lost** | Two people typing into one note at once both keep every keystroke, and a change made offline that no longer fits the note is kept as a note of its own, with a word to say so. |
| ☑️ **Bulk selection** | Tick the box on a card (or hold it, on a phone) and the header becomes a selection bar with the actions of the view you are in — pin, reminder, colour, labels, archive, delete, make a copy and download in the notes, restore and delete forever in the trash — plus *Select all*. |
| ↕️ **Checklist rows move by hand** | Drag a row by its six-dot handle: it stays in the list, the rows around it make room, and it lands where it is drawn. One gesture, one undo, and Tab / Shift+Tab change its level. |
| ⏰ **Reminders** | A moment on a note — optionally repeating daily, weekly, monthly or yearly — gathered in their own view by what is due soonest. |
| 📌 **Pinning & your own order** | Pin the notes you keep coming back to; they lead the list under a *Pinned* heading, above *Others*. Drag a card to put the notes in your own order, or sort them by the date they were created or modified. |
| 🗄️ **Archive & trash** | Archive what you are done with; trashed notes purge themselves after 30 days. |
| 🕓 **Version history** | Every edit to a note's text keeps the state it replaced, listed in *More → Version history* and downloadable as Markdown. |
| 🖼️ **Pictures** | Add images to a note from the card, the editor or the composer, or paste and drop them in; they sit above the title, open full size, and are shared with collaborators. |
| ⬇️ **Markdown export & import** | *More → Download as Markdown* on a note, or a `.zip` for several picked notes; *Settings → Import notes* reads such files back, or plain Markdown from elsewhere. Labels travel as `#tags` after the title, the rest in a comment ([`docs/MARKDOWN.md`](docs/MARKDOWN.md)). |
| 🌍 **Three languages** | American English, British English, and Polish. |
| 📱 **Installable PWA** | Works on desktop and mobile; add it to your home screen. Opens and edits your notes without a connection, and sends the changes when it is back. Installed on a phone, it is in the system's *Share* sheet: text, links and pictures shared from another app become a new note. |
| 🔒 **Self-hosted** | One container, one SQLite file, no external services. |

### How editing works

Editing opens **inline above the notes**, the way Keep does it: for a new note the editor takes the
place of the "Take a note…" box, and a note opened from the grid floats over the notes with the app
dimmed behind it — the grid keeps the note's slot, so the cards around it never move. Clicking
outside the card (or Escape) settles the note back among the others with a short animation.

### Deliberately not implemented (yet)

Drawings, voice notes and other media, note search on the server, and pictures in the Markdown export.

Two people typing into the same note at the same instant are **merged keystroke by keystroke**: the
body is written as ProseMirror steps (`prosemirror-collab`) over a log the server orders, and the
writer whose steps arrive second takes the first one's in and rebases their own over them — both keep
what they typed, nobody is warned, and the caret stays put (`docs/COLLABORATION.md`). Real Google Keep
by report can leave both writers looking at text glued together from both versions. Collaborator
cursors and presence are a Google Docs feature and are out of scope. The internal note format is a structured block document,
which is what keeps the Markdown export an exact, unit-tested conversion
(`frontend/src/entity/markdown.ts`).

---

## Screenshots

| Appearance picker | Notes grid |
| --- | --- |
| ![Appearance picker](docs/images/card-appearance.jxl) | ![Notes grid](docs/images/notes-dark.jxl) |

| Editing an existing note | Polish interface |
| --- | --- |
| ![Editing an existing note](docs/images/editing.jxl) | ![Polish interface](docs/images/polish.jxl) |

| Mobile | Mobile editor |
| --- | --- |
| ![Mobile](docs/images/mobile.jxl) | ![Mobile editor](docs/images/mobile-editor.jxl) |

---

## Quick start

There are two ways to run Notka on your own computer. Docker needs nothing else installed;
the script needs Java and Node.js but no Docker.

### With Docker (recommended)

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with
Compose v2).

```bash
git clone https://github.com/Linuksiarz/OpenKeep.git notka
cd notka
NOTKA_ADMIN_USERNAME=admin NOTKA_ADMIN_PASSWORD='a long password' docker compose up --build -d
```

Open <http://localhost:8080> and **sign in as the administrator** with that username. The two
variables are read on the first start only — the administrator is created then, and every later
start ignores them. Sign-up starts **closed**; open it for others in *gear → Server settings*
(see [Administration](#administration)). The first build takes a few
minutes; later ones reuse the cache.

To look around with sample data instead, start it as a demo:

```bash
DEMO=true docker compose up --build -d
```

and sign in with one of the two accounts the sign-in screen offers — Alice is the demo's
administrator.

| | |
| --- | --- |
| Stop it | `docker compose down` |
| See the log | `docker compose logs -f` |
| Use another port | `NOTKA_HTTP_PORT=8090 docker compose up -d` |
| Throw the data away (demo → real use) | `docker compose down -v` — **deletes every note** |

Everything lives in the named volume `notka-data` (the SQLite database at
`/data/notka.db`, pictures included). To back up, copy that file — nothing else holds state.

### Without Docker

Needs **Java 21** and **Node.js 22+** (on a Mac: `brew install openjdk@21 node`). pnpm is used
when it is installed and fetched with `npx` when it is not.

```bash
./run-local.sh             # your own instance, data in ./data/notka.db
./run-demo.sh              # a demo with two sample accounts, data in ./data/demo.db
./run-demo.sh --fresh      # the same demo from scratch
```

On the first start of your own instance the script asks for the administrator's username and
password.

The script builds the frontend and the backend and runs Notka as one process on
<http://localhost:8080> (`NOTKA_PORT` changes the port). Ctrl+C stops it.

### Configuration

Every setting but the first administrator is optional and has a working default.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOTKA_BIND` | `127.0.0.1` | Host address Compose publishes the port on. Loopback, so only a reverse proxy on the same host reaches the app. |
| `NOTKA_HTTP_PORT` | `8080` | Host port published by Compose. |
| `NOTKA_COOKIE_SECURE` | `true` in Compose, `false` otherwise | The session cookie is only sent over HTTPS. Browsers make an exception for `localhost`. |
| `NOTKA_TRUST_PROXY_HEADERS` | `true` in Compose, `false` otherwise | Take the client address from the reverse proxy's `X-Forwarded-For` (the sign-in rate limit is keyed by it). Only safe when nothing but the proxy can reach the app. |
| `NOTKA_ADMIN_USERNAME`, `NOTKA_ADMIN_PASSWORD` | – | The administrator, created on the **first start** of an empty instance — required then, ignored (with a warning in the log) afterwards. |
| `NOTKA_ADMIN_EMAIL` | – | Optional address of that administrator, so notes can be shared with it. |
| `NOTKA_PUBLIC_URL` | – | The address people reach the instance at, e.g. `https://notes.example.com`. Password-reset links are built from it. |
| `NOTKA_SMTP_HOST`, `NOTKA_SMTP_FROM` | – | Outgoing mail server and sender, for password resets. Without them nothing is sent. |
| `NOTKA_SMTP_SECURITY`, `NOTKA_SMTP_PORT` | `starttls`, by security | `starttls` (587), `force_tls` (465) or `off` (25). |
| `NOTKA_SMTP_USERNAME`, `NOTKA_SMTP_PASSWORD` | – | Login at the mail server, when it wants one. |
| `NOTKA_SMTP_FROM_NAME`, `NOTKA_SMTP_TIMEOUT` | `Notka`, `15` | Sender's name; seconds before a silent mail server counts as failed. |
| `NOTKA_MAX_NOTES_PER_USER` | `10000` | How many notes one account may own, trash included. |
| `NOTKA_MAX_IMAGE_STORAGE_MB` | `1024` | Picture storage of the notes one account owns, in MB. |
| `NOTKA_MEMORY_LIMIT` | `512m` | Memory ceiling of the container (Compose only). |
| `NOTKA_SESSION_TTL_DAYS` | `30` | How long a login lasts; extended on each request. |
| `NOTKA_TRASH_RETENTION_DAYS` | `30` | How long a trashed note is kept before it is purged. |
| `NOTKA_MAX_NOTE_BYTES` | `65536` | Maximum size of a single note document. |
| `NOTKA_LOG_LEVEL` | `INFO` | Logback root level. |
| `DEMO` | `false` | Start as a **demo instance**: two sample accounts, each with notes, plus two notes they share — one checklist and one text note. Alice is the administrator. The sign-in screen offers the accounts, so there is nothing to look up. Seeds only an empty database. |

Set them in a `.env` file next to `docker-compose.yml`, or export them before `docker compose up`.

### Demo mode

```bash
DEMO=true docker compose up --build -d   # or: ./run-demo.sh
```

Both accounts are seeded with notes that exercise the whole format: plain colours, both kinds of
illustrated background, a pinned note, a checklist with an indented row and a completed item, a note
carrying links (so the link previews have something to show), and a note with headings and inline
styling. `DemoData.kt` is the exact list; these are the first few.

| Account | Password | Has |
| --- | --- | --- |
| `alice@example.com` (administrator) | `alice123` | *Welcome to Notka* (pinned), *Reading list* (a background), *Ideas for the weekend*, *Recipes to try*, *Meeting notes*, *Books to lend*, *Things to look up* (links), *Home repairs*, *Weekend shopping* |
| `bob@example.com` | `bob12345` | *Standup notes*, *Lisbon trip* (a background), *Gym plan*, *Budget for June*, *Podcast queue*, *Garden plans*, *Gifts to buy*, *Porto trip* |

They also share **Groceries together** (a checklist both can tick) and **Apartment ideas** (a text
note both can write). Sign in as both in two browsers to watch the live updates, the appearance
rule, and two people typing into one note at once do their thing. The passwords are public on purpose — never point
`DEMO=true` at anything you care about.

### Administration

The administrator's gear menu has one more entry, **Server settings**:

- **Sign-up** — open or close registration for the whole instance. It starts closed; to let family
  members in, open it, let them register, and close it again.
- **Background themes** — upload themes (`.zip`, see [`docs/THEMES.md`](docs/THEMES.md)), remove
  them, and choose the instance's default. Every account picks one of them for itself in its own
  Settings, or follows the default.
- **Accounts** — every account with its notes and the room they take (text, version history,
  pictures), plus the size of the whole database. An account can be **deleted** with everything it
  owns, or sent a **password reset**: an e-mail with a link to choose a new password, valid for 24
  hours and once. The old password stops working as soon as the mail server accepts the message.

Mail goes through an external SMTP server, configured the way Vaultwarden's is (`NOTKA_SMTP_HOST`,
`NOTKA_SMTP_SECURITY`, `NOTKA_SMTP_USERNAME`, …); any provider or your own relay works.

### On a server (production)

`docker-compose.yml` is production-shaped: the container listens on `127.0.0.1:8080` only, runs
read-only as an unprivileged user with no capabilities, sends the session cookie over HTTPS only and
trusts the reverse proxy's `X-Forwarded-For`. What is left to you:

1. Put a TLS-terminating reverse proxy on the same host — `deploy/Caddyfile.example` is a complete
   one (certificates included). Do not publish port 8080 to the internet.
2. Put `NOTKA_ADMIN_USERNAME` and `NOTKA_ADMIN_PASSWORD` in `.env` for the first start, sign in,
   and take the password out of `.env` again — it is ignored from then on.
3. Set `NOTKA_PUBLIC_URL` and the `NOTKA_SMTP_*` variables if you want to reset other people's
   passwords by e-mail (`.env.example` has them all).
4. Back up the `notka-data` volume (one SQLite file).

`deploy/notka.service` is the same setup as a systemd unit, for running without Docker.

Expired sessions are purged every six hours, the account menu can sign out of every device, an
account owns at most `NOTKA_MAX_NOTES_PER_USER` notes and 500 labels, and holds at most 16 live
event streams. The server limits sign-in attempts to 10 a minute per client address, refuses request bodies larger
than a note can be, refuses state-changing requests made from another site's page, and sends a
Content-Security-Policy that forbids every script it did not serve itself.

---

## Local development

For working on the code, with the frontend reloading as you save. Requirements: **JDK 21**,
**Node.js 22+** and **pnpm 10+**. Node.js 25 and later no longer ship `corepack`, so install pnpm
yourself: `brew install pnpm` or `npm install -g pnpm`.

```bash
# Backend — http://localhost:8080
GRADLE_USER_HOME=$PWD/.gradle-home ./gradlew :backend:run

# Frontend — http://localhost:5173 (proxies /api to :8080)
cd frontend
pnpm install
pnpm run dev
```

> `GRADLE_USER_HOME` is only needed in sandboxes where `$HOME` is read-only. In a normal checkout
> plain `./gradlew` works.

### Tests and checks

```bash
GRADLE_USER_HOME=$PWD/.gradle-home ./gradlew :backend:test   # Kotlin unit + HTTP tests

cd frontend
pnpm run check                                               # svelte-check + TypeScript
pnpm run test                                                # Vitest (document format, Markdown, grid, editor logic, i18n)
```

The browser suites need a running server and are described in
[`frontend/e2e/README.md`](frontend/e2e/README.md):

```bash
pnpm run e2e              # the whole application
pnpm run e2e:live         # live collaboration between two accounts
pnpm run e2e:concurrency  # two people typing into one note at once
pnpm run e2e:editor       # the editor, against a stubbed API (pnpm run build && pnpm run preview)
pnpm run e2e:mobile       # the phone layout and the share target; Firefox: -- <url> firefox
```

### Building the artifacts

```bash
GRADLE_USER_HOME=$PWD/.gradle-home ./gradlew :backend:shadowJar   # backend/build/libs/notka-backend-all.jar
cd frontend && pnpm run build                                     # frontend/dist
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  One container                                             │
│                                                            │
│  Ktor / Netty :8080                                        │
│   ├── /api/**        JSON API                              │
│   └── /**            compiled Svelte SPA (with SPA routing) │
│                                                            │
│  SQLite  /data/notka.db                                  │
└────────────────────────────────────────────────────────────┘
```

| Area | Choice |
| --- | --- |
| Backend | Kotlin 2.4 (JVM 21), Ktor 3, Exposed, SQLite |
| Frontend | Svelte 5 (runes) + TypeScript + Vite, installable PWA |
| Editor | Tiptap 3 (ProseMirror) via `svelte-tiptap` — the note body is theirs, the storage format is ours |
| Simultaneous editing | ProseMirror's own `prosemirror-collab`, with the server ordering the steps |
| Build | Gradle 9 with the Kotlin DSL and a version catalog |
| Storage | One SQLite file in WAL mode |

Both source trees follow **Entity–Control–Boundary**, with dependencies pointing strictly inward
(`boundary → control → entity`). See [`AGENTS.md`](AGENTS.md) for the rules and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.

### Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, startup sequence, configuration, frontend structure |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | SQLite schema and the `NoteDocument` content format |
| [`docs/API.md`](docs/API.md) | Every HTTP endpoint, payload, and error code |
| [`docs/I18N.md`](docs/I18N.md) | Locales, message catalogues, plural rules, error localization |
| [`docs/COLLABORATION.md`](docs/COLLABORATION.md) | Live updates, the SSE channel, and how simultaneous typing is merged |
| [`docs/METRICS.md`](docs/METRICS.md) | Every number taken off the original, with the measurement it came from |
| [`docs/THEMES.md`](docs/THEMES.md) | Background themes: the built-in one, the Google Keep one, and how to make your own |
| [`docs/MARKDOWN.md`](docs/MARKDOWN.md) | The Markdown file format of the export and the import |
| [`docs/DIFFERENCES.md`](docs/DIFFERENCES.md) | What Notka adds, does differently, and leaves out compared with Google Keep |
| [`frontend/e2e/README.md`](frontend/e2e/README.md) | The browser suites: what each one covers and how to run it |
| [`AGENTS.md`](AGENTS.md) | Coding rules for humans and AI agents |

### Notes on two deliberate design decisions

**Content is a block document, not HTML.** A note's body is stored as
`{"version":1,"blocks":[…]}` where each block is a typed line (`paragraph`, `heading1`…`heading3`,
`bulleted`, `numbered`, `checklist`) holding styled spans. Rendering builds text nodes and a fixed
element whitelist — note content can never inject markup — and the Markdown export becomes a pure
function over the same structure.

**Appearance belongs to the note.** Colour and background are stored on the note itself, so
everyone with access — the owner, a *view only* collaborator, a *can edit* collaborator — sees the
same thing, and anyone who can edit changes it for everyone. This is intentionally different from
Google Keep, where colour is personal and a collaborator's choice never changes what the owner sees.
It is covered by `NoteAppearanceTest`.

---

## HTTP API

The API is small and documented in full in [`docs/API.md`](docs/API.md). A taste of it:

```bash
# Register (stores the session cookie in cookies.txt)
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","displayName":"Ada Lovelace","password":"correct horse"}' \
  http://localhost:8080/api/auth/register

# Create a note
curl -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"title":"Groceries","kind":"LIST"}' \
  http://localhost:8080/api/notes

# List active notes
curl -b cookies.txt 'http://localhost:8080/api/notes?view=active'
```

Errors always use the same envelope, and carry a stable key the frontend localizes:

```json
{ "error": { "code": "CONFLICT", "key": "share.already_shared",
             "message": "This note is already shared with bob@example.com",
             "params": { "email": "bob@example.com" } } }
```

---

## Roadmap

- [ ] Drawings and voice notes (pictures are implemented)
- [ ] JPEG XL pictures: `ImageFormats` recognises `.jxl` by its bytes next to PNG, JPEG, GIF and WebP, in note pictures and in themes
- [ ] Markdown export endpoint (the conversion is implemented, tested, and downloadable per version)
- [ ] Server-side search
- [ ] Keep's own snackbar instead of svelte-sonner: one notification at a time, with its action, that
      always goes away after its time — svelte-sonner holds a toast for as long as the pointer is
      over it, and cannot be told not to; the original's goes away regardless (measured 2026-10-14)

What Google Keep has and Notka does not yet, with the effort each would take (compared again on
2026-10-19; drawings and voice notes are out of scope, see above):

| Feature | Effort |
| --- | --- |
| *Undo* on the snackbar after deleting from the editor or the selection bar (a card's own delete already has it) | very small |
| *Send* — share a note to another app (Web Share API on a phone, the copy to the clipboard elsewhere) | very small |
| More of the Android app's launcher shortcuts: *New note* and *New photo* next to the existing *New list* | very small |
| Reminder presets: *Later today 8:00 PM*, *Tomorrow 8:00 AM*, *Next week Mon 8:00 AM*, and the default times for morning, afternoon and evening in Settings | small |
| Keyboard shortcuts: `c` new note, `l` new list, `/` search, `j`/`k` move between notes, `e` archive, `#` delete, `f` pin, `x` select, `Ctrl+G` grid or list, `?` the list of shortcuts | small |
| Settings: add new list items at the bottom, move ticked items to the bottom, show rich link previews, enable sharing | small each |
| Swiping a card sideways to archive it (the Android app) | small–medium |
| A notification when a reminder is due while the app is open | small–medium |
| *Find in note* (the Android app's ⋮ menu) | small–medium |
| Reminder notifications while the app is closed (Web Push from the server) | medium |
| Location reminders (*Pick a place*) | medium |
| *Grab image text* — the text of a picture, recognised on the device | large |

Done since the first comparison (2026-10-15): *Undo* after archiving, *Uncheck all* / *Delete
checked items* in the ⋮ menu on a wide screen, bulk pin, colour, labels, reminder and copy for picked
notes, receiving a share from another app, dragging notes into your own order, and label suggestions
after `#`.

---

## License

Notka is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified
version of Notka as a service for others, the AGPL asks you to offer them its source code.
