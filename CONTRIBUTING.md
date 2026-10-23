# Working on Notka

Everything about developing Notka: running it from source, the checks, building the artifacts,
releasing, and how the code is laid out. Deploying it on your own server is in the
[README](README.md); what is planned is in [ROADMAP.md](ROADMAP.md).

The coding rules (layers, naming, i18n, tests, and the product rules that must not regress) are in
[`AGENTS.md`](AGENTS.md). They apply to people and AI agents alike.

## Running it from source

### One process, no reloading

Needs **Java 21** and **Node.js 22+** (on a Mac: `brew install openjdk@21 node`). pnpm is used when
it is installed and fetched with `npx` when it is not.

```bash
./run-local.sh             # your own instance, data in ./data/notka.db
./run-demo.sh              # a demo with two sample accounts, data in ./data/demo.db
./run-demo.sh --fresh      # the same demo from scratch
```

The script builds the frontend and the backend and runs Notka as one process on
<http://localhost:8080> (`NOTKA_PORT` changes the port). On the first start of your own instance it
asks for the administrator's username and password. Ctrl+C stops it.

### With the frontend reloading as you save

Needs **JDK 21**, **Node.js 22+** and **pnpm 10+**. Node.js 25 and later no longer ship `corepack`,
so install pnpm yourself: `brew install pnpm` or `npm install -g pnpm`.

```bash
# Backend on http://localhost:8080
./gradlew :backend:run

# Frontend on http://localhost:5173 (proxies /api to :8080)
cd frontend
pnpm install
pnpm run dev
```

In a sandbox where `$HOME` is read-only, prefix every Gradle command with
`GRADLE_USER_HOME=$PWD/.gradle-home`.

### Demo data

`DEMO=true` (or `./run-demo.sh`) seeds an empty database with two accounts. Both are offered on the
sign-in screen, and Alice is the instance's administrator.

| Account | Password | Has |
| --- | --- | --- |
| `alice@example.com` (administrator) | `alice123` | *Welcome to Notka* (pinned), *Reading list* (a background), *Ideas for the weekend*, *Recipes to try*, *Meeting notes*, *Books to lend*, *Things to look up* (links), *Home repairs*, *Weekend shopping* |
| `bob@example.com` | `bob12345` | *Standup notes*, *Lisbon trip* (a background), *Gym plan*, *Budget for June*, *Podcast queue*, *Garden plans*, *Gifts to buy*, *Porto trip* |

They also share **Groceries together** (a checklist both can tick) and **Apartment ideas** (a text
note both can write). Sign in as both in two browsers to see live updates, the shared appearance and
two people typing into one note at once. The notes cover the whole format: colours, backgrounds, a
pinned note, a checklist with an indented row and a completed item, links and inline styling.
`DemoData.kt` is the exact list. The passwords are public on purpose, so never point `DEMO=true` at
data you care about.

## Tests and checks

```bash
./gradlew :backend:test     # Kotlin unit and HTTP tests

cd frontend
pnpm run check              # svelte-check and TypeScript
pnpm run test               # Vitest: document format, Markdown, grid, editor logic, i18n
```

The browser suites need a running server and are described in
[`frontend/e2e/README.md`](frontend/e2e/README.md):

```bash
pnpm run e2e              # the whole application
pnpm run e2e:live         # live collaboration between two accounts
pnpm run e2e:concurrency  # two people typing into one note at once
pnpm run e2e:editor       # the editor, against a stubbed API (pnpm run build && pnpm run preview)
pnpm run e2e:mobile       # the phone layout and the share target; Firefox: -- <url> firefox
pnpm run screenshots      # the images in docs/images, as lossless JPEG XL
```

## Building the artifacts

```bash
./gradlew :backend:shadowJar      # backend/build/libs/notka-backend-all.jar
cd frontend && pnpm run build     # frontend/dist
cd apk && pnpm run build          # the Android app, see apk/README.md
docker compose build              # the single image with both
```

### The Android app

The app is a WebView on the reader's own server, so a change to the frontend or the backend reaches
it by deploying the server. Rebuild the APK only after changing `apk/` itself (its pages in
`apk/www/`, `capacitor.config.json`, the Kotlin in `apk/android/`) or its Capacitor version. It needs
JDK 21 and the Android SDK (`ANDROID_HOME`, or `sdk.dir` in `apk/android/local.properties`).

```bash
cd apk
pnpm install
pnpm run build
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

A signed release build and the signing key are described in [`apk/README.md`](apk/README.md).

## Releasing

The version lives in three places, one per module, and a release bumps all three to the same value:

- `version` in `backend/build.gradle.kts` (reported by `GET /api/health`),
- `version` in `frontend/package.json` (shown in the sidebar's footer),
- `version` in `apk/package.json` (the APK's `versionName`).

Raise `versionCode` in `apk/android/app/build.gradle.kts` by one as well, because Android installs
an update only over a lower one. Then push a tag named after the version:

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release-apk.yml` builds the signed APK and attaches it to the tag's GitHub
release. A tag with a pre-release part (`v1.0.0-rc3`) makes a pre-release.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  One container                                               │
│                                                              │
│  Ktor / Netty :8080                                          │
│   ├── /api/**        JSON API                                │
│   └── /**            compiled Svelte SPA (with SPA routing)  │
│                                                              │
│  SQLite  /data/notka.db                                      │
└──────────────────────────────────────────────────────────────┘
```

| Area | Choice |
| --- | --- |
| Backend | Kotlin 2.4 (JVM 21), Ktor 3, Exposed, SQLite |
| Frontend | Svelte 5 (runes), TypeScript, Vite, installable PWA |
| Editor | Tiptap 3 (ProseMirror) via `svelte-tiptap`: the note body is theirs, the storage format is ours |
| Simultaneous editing | ProseMirror's own `prosemirror-collab`, with the server ordering the steps |
| Android app | Capacitor 8 WebView on the reader's own server (`apk/`) |
| Build | Gradle 9 with the Kotlin DSL and a version catalog |
| Storage | One SQLite file in WAL mode |

Both source trees follow **Entity, Control, Boundary**, with dependencies pointing strictly inward
(`boundary → control → entity`). `backend/` and `frontend/` are independent modules that talk only
over the HTTP API. [`AGENTS.md`](AGENTS.md) has the rules and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) the full picture.

### Two deliberate design decisions

**Content is a block document, not HTML.** A note's body is stored as
`{"version":1,"blocks":[…]}`, where each block is a typed line (`paragraph`, `heading1` to
`heading3`, `bulleted`, `numbered`, `checklist`) holding styled spans. Rendering builds text nodes
and a fixed set of elements, so note content can never inject markup, and the Markdown export is a
pure function over the same structure.

**Appearance belongs to the note.** Colour and background are stored on the note itself, so
everyone with access (the owner, a *view only* and a *can edit* collaborator) sees the same thing,
and anyone who can edit changes it for everyone. Google Keep does this differently: there, colour is
personal. `NoteAppearanceTest` covers it.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, startup sequence, configuration, frontend structure |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | SQLite schema and the `NoteDocument` content format |
| [`docs/API.md`](docs/API.md) | Every HTTP endpoint, payload and error code |
| [`docs/I18N.md`](docs/I18N.md) | Locales, message catalogues, plural rules, error localization |
| [`docs/COLLABORATION.md`](docs/COLLABORATION.md) | Live updates, the SSE channel, and how simultaneous typing is merged |
| [`docs/METRICS.md`](docs/METRICS.md) | Every number taken off the original, with the measurement it came from |
| [`docs/THEMES.md`](docs/THEMES.md) | Background themes: the built-in one, the Google Keep one, and how to make your own |
| [`docs/MARKDOWN.md`](docs/MARKDOWN.md) | The Markdown file format of the export and the import |
| [`docs/DIFFERENCES.md`](docs/DIFFERENCES.md) | What Notka adds, does differently, and leaves out compared with Google Keep |
| [`frontend/e2e/README.md`](frontend/e2e/README.md) | The browser suites: what each one covers and how to run it |
| [`apk/README.md`](apk/README.md) | The Android app: building, signing, releasing |
| [`AGENTS.md`](AGENTS.md) | Coding rules for people and AI agents |

## The HTTP API

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

Errors always use the same envelope and carry a stable key that the frontend localizes:

```json
{ "error": { "code": "CONFLICT", "key": "share.already_shared",
             "message": "This note is already shared with bob@example.com",
             "params": { "email": "bob@example.com" } } }
```

## Commits

Commit messages are imperative, in American English, and name the module, for example
`backend: reject sharing a note with its owner`.
