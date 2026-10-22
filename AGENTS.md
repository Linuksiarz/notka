# AGENTS.md

Guidance for AI agents (and humans) working in the **Notka** repository.

Notka is an open-source, self-hostable clone of Google Keep. It is **not** affiliated with,
endorsed by, or connected to Google in any way. Only the look and feel is intentionally similar.

---

## Project Snapshot

| Area | Choice |
| --- | --- |
| Backend | Kotlin (JVM 21) + Ktor 3 + Exposed + SQLite |
| Frontend | Svelte 5 (runes) + TypeScript + Vite, installable PWA |
| Android app | Capacitor 8 WebView on the reader's own server (`apk/`), Android 12+ |
| Build | Gradle (Kotlin DSL) multi-project, version catalog |
| Deployment | Single container (API + SPA) via `docker-compose.yml` |
| License | AGPL-3.0 |

**Browser targets:** mobile browsers first (Android Chrome, iOS Safari), then **Firefox and Chrome on
the desktop** — both, not just Chromium. Anything that only works in one of them is a bug: check a
change against Firefox as well, and prefer the standard property (`scrollbar-width`/`scrollbar-color`
next to `::-webkit-scrollbar`, `overflow: clip` only where the fallback is harmless). The mobile
browsers' overlay scrollbars are their own behaviour; on the desktop the scrollbar is part of the
original's look and is reserved from the first frame (`html { overflow-y: scroll }`).

Repository layout:

```
notka/
├── AGENTS.md            <- you are here
├── backend/             <- Kotlin/Ktor service, SQLite persistence, owns :backend Gradle project
├── frontend/            <- Svelte + TypeScript PWA
├── apk/                 <- Android app: Capacitor shell that opens the reader's server (apk/README.md)
├── docs/                <- architecture, HTTP API contract, data model, i18n
├── deploy/              <- reverse proxy examples, systemd units
├── Dockerfile
└── docker-compose.yml
```

`backend/` and `frontend/` are **independent modules**. They only communicate over the HTTP API
documented in `docs/API.md`. `apk/` is a third: it only loads the server's pages, and the frontend
reaches it only through Capacitor's bridge (`boundary/androidApp.ts`, `boundary/systemBar.ts`). Do not introduce cross-module coupling (shared source sets, generated
code consumed by both, or Gradle projects that depend on each other's internals).

---

## Build & Test Commands

> **Important:** in this environment `$HOME` is read-only. Gradle must use a project-local
> Gradle user home, otherwise it fails with `Failed to load native library 'libnative-platform.so'`.
> Prefix every Gradle invocation with `GRADLE_USER_HOME=$PWD/.gradle-home`.

```bash
# Backend
GRADLE_USER_HOME=$PWD/.gradle-home ./gradlew :backend:test        # unit + HTTP tests
GRADLE_USER_HOME=$PWD/.gradle-home ./gradlew :backend:shadowJar   # fat jar -> backend/build/libs

# Frontend
cd frontend
pnpm install
pnpm run check     # svelte-check + tsc
pnpm run test      # Vitest: Markdown conversion, i18n catalogues
pnpm run build     # production bundle -> frontend/dist
pnpm run dev       # dev server on :5173, proxies /api to :8080

# Browser suites (need a running server; see frontend/e2e/README.md)
pnpm run e2e              # full application regression, 162 checks
pnpm run e2e:live         # live collaboration between two accounts
pnpm run e2e:concurrency  # two people typing into one note at once
pnpm run e2e:editor       # editor interactions, stubbed API + pnpm preview
pnpm run e2e:mobile      # the phone layout, Chromium and Firefox
pnpm run screenshots      # regenerate docs/images

# Android app (JDK 21 + Android SDK)
cd apk
pnpm install
pnpm run build            # debug APK -> apk/android/app/build/outputs/apk/debug
pnpm run build:release    # signed when NOTKA_KEYSTORE* are set (apk/README.md)
```

**The version** is `version` in `backend/build.gradle.kts` (written into the jar, reported by
`GET /api/health`), `version` in `frontend/package.json` (written into the bundle, shown in the
sidebar's footer) and `version` in `apk/package.json` (the APK's `versionName`). The modules are
independent, so a release bumps **all three**, to the same value — and raises the APK's `versionCode`
(`apk/android/app/build.gradle.kts`) by one, because Android installs an update only over a lower one.

The browser suites are the only automated check for the live channel, the conflict warning, the
editor's DOM behaviour, and the sharing appearance rule end to end. A change to any of those is not
verified until they pass.

---

## Architecture: Entity–Control–Boundary

Every source tree in this project is organized as **Entity / Control / Boundary** (Jacobson).
The rule is the same on both sides of the API:

| Layer | Backend (`backend/src/main/kotlin/dev/duwe/notka/`) | Frontend (`frontend/src/`) |
| --- | --- | --- |
| **entity** | Domain model (`entity/model`) and persistence gateways (`entity/persistence`): tables, migrations, repositories. No Ktor, no HTTP. | Pure domain types and format logic: wire types, `NoteDocument` model, Markdown conversion, appearance constants, formatting. No DOM, no `fetch`. |
| **control** | Application services / use cases: `AuthService`, `NoteService`, `SharingService`, `LabelService`, `TrashCleanupJob`. No Ktor types, no SQL. | Application logic: API clients, reactive stores, router, autosave orchestration. |
| **boundary** | Adapters to the outside world: `boundary/config` (environment) and `boundary/http` (DTOs, mappers, plugins, routes, status codes). | Adapters to the outside world: Svelte components, routes, DOM editor engine, i18n catalogues, styles, PWA assets. |

Dependency direction is strictly inward:

```
boundary ──▶ control ──▶ entity
```

- `entity` imports nothing from `control` or `boundary`.
- `control` imports nothing from `boundary`.
- Only the boundary layer knows about HTTP status codes, Ktor, the DOM, or `fetch`.
- A file that does not fit the table above is a design smell — discuss before adding it.

---

## Internationalization

The app ships in **three locales**: `en-US` (American English), `en-GB` (British English), `pl`
(Polish). See `docs/I18N.md`.

- **Never** write a user-visible string inline in a component. Add it to the catalogues in
  `frontend/src/boundary/i18n/locales/` and read it through `t('some.key')`.
- `en-US` is the source of truth: its catalogue defines the `Messages` type, and the other locales
  must satisfy that type exactly (a missing key is a compile error).
- `en-GB` exists for spelling, date, and number conventions, not for different wording.
- The backend **never** translates. It returns a stable `error.key` plus optional `error.params`;
  the frontend localizes from that (see the error format in `docs/API.md`). The one exception is
  the **e-mail** the server sends (`boundary/mail/SmtpAccountMail.kt`): it leaves the app, so no
  frontend can localize it. It is written in the language of the administrator's `Accept-Language`
  (`pl`, otherwise English).
- Dates, times, and numbers always go through `Intl` with the active locale — never
  `toLocaleDateString()` without an explicit locale argument.
- The active locale is stored in `localStorage` (`notka.locale`) and sent to the API as
  `Accept-Language`.

---

## Language & Style

- Write **all** code, identifiers, comments, commit messages, and documentation in
  **American English**.
- Prefer **Kotlin**. If you encounter Java or Groovy code in the project, rewrite it in Kotlin —
  unless the rewrite would require disproportionately large changes; in that case,
  leave it and note the reason.
- Follow **KISS**. Do not over-engineer. Choose the simplest solution that solves
  the problem.
- Favor **self-documenting code** (clear names, small functions) over comments.
  Add comments only when intent cannot be expressed by the code itself
  (e.g., non-obvious business rules, workarounds).
- **JPEG XL is the preferred image format.** Wherever a PNG would be used — screenshots and the
  images in `docs/` — store the image as **lossless** JPEG XL (`.jxl`, `cjxl -d 0`). The screenshot
  scripts already do this (`frontend/e2e/jxl.mjs`). Other formats are for what the outside world
  requires, such as the pictures a user uploads, which the server accepts by their bytes.

## Before Implementing

- **Use what is already available before writing your own.** A dependency that ships the thing you
  are about to build wins over a hand-written version, every time: read `frontend/package.json` (and
  `gradle/libs.versions.toml`) first, then look for the primitive in the library's own docs. This
  project already depends on **bits-ui** for dialogs, popovers, dropdown menus, tooltips and every
  other interaction primitive, **@iconify** for icons, **svelte-sonner** for toasts, **Exposed** for
  persistence and **Ktor** for HTTP — all of them have far more in them than we currently use.
  Style a library primitive to look like Keep; do not re-implement it. Hand-rolling is justified
  only when nothing suitable exists, when the dependency is heavier than the problem, or when the
  owner has explicitly steered away — and then say so in a comment with the reason.
- **What the platform does natively is done natively.** Before writing behaviour in script, check
  whether the browser already has it: HTML5 drag and drop (`draggable`, `dragstart`/`dragover`/`drop`)
  rather than a pointer-tracking drag, `<dialog>`/popover and form controls rather than imitations,
  `:has()`/`:focus-within` and other CSS rather than state mirrored from DOM events, the Web Share,
  Notification and Clipboard APIs rather than hand-made substitutes. Native behaviour comes with
  touch, keyboard, accessibility and the platform's own feel for free, and it does not race the
  framework. Write it by hand only where the native one cannot do what is needed — and then say why
  in a comment. (Example: the reordering of notes in the grid is native drag and drop; a phone starts
  it with a held finger the way the platform does, with no code of ours to stop the page scrolling.)
- **Search the codebase first.** Check whether the functionality (or a close
  equivalent) already exists. If it does, extend or reuse it instead of duplicating.
- Confirm the module boundary: `backend/` and `frontend/` are independent — do not create
  cross-module coupling unless explicitly required.
- Read `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md` and `docs/API.md` before changing behavior.

## No Backward Compatibility

**Nothing is deployed yet.** Every change targets the current code only. Do not add:

- fallback paths for "old" payloads, formats, endpoints, or configuration keys;
- versioned migration scripts or data back-fills;
- deprecated aliases, feature flags, or dual-read/dual-write shims;
- compatibility branches for previously released behavior.

When a requirement changes, change the code, the schema, the API contract, and the docs — and
delete what the change made obsolete. `PRAGMA user_version` is used only to tell "schema already
created" apart from "empty database file"; it is **not** a migration framework, and it is never a
reason to skip the statements. Every `CREATE TABLE IF NOT EXISTS` runs **on every start**, which is
what makes a table added to the list appear in a database that already exists — skipping them on the
marker is what left a running instance without `link_previews` and made every read of it fail. A
*changed* column is still a schema change, and a pre-release database carrying the old shape is
thrown away.

## Answering the User

- Be **concise**. Answer simple questions with short, direct responses; skip
  preambles and long summaries.
- Only produce detailed explanations when the user asks for depth or the task
  genuinely requires it.

## Git & Commits

- **Never commit** or push changes unless the user explicitly asks you to.
- Do not create branches, tags, or amend history on your own initiative.
- Commit messages (when asked for) are imperative, American English, and reference the module,
  e.g. `backend: reject sharing a note with its owner`.

## Kotlin Conventions

- Use idiomatic Kotlin: `val` over `var`, data classes for DTOs, extension
  functions where they improve readability, `require`/`check` for preconditions.
- Prefer standard library and existing project utilities over new dependencies.
- Keep functions small and pure where practical; isolate I/O at the edges.

### File layout

- Only **tunables** (top-level `const val` / `private const val` constants used
  to configure behavior) belong above the class/object declaration in a file.
- Everything that is part of the internal logic of a class — including the
  logger — must live **inside** that class/object:

  ```kotlin
  class Foo {
      private val logger = KotlinLogging.logger {}
      // ...
  }
  ```

  Do **not** declare `private val logger = KotlinLogging.logger {}` at the
  top level of a Kotlin file. This keeps the logger scoped and the file
  header limited to configuration knobs.
- For top-level functions (files without a class), a file-scoped
  `private val logger` is acceptable, but still placed **below** the tunables.
- Prefer defining `companion object` blocks at the **top** of a class (right
  after the primary constructor / property declarations that must precede
  them), not at the bottom. This keeps class-level constants and factories
  discoverable without scrolling past the implementation.

## TypeScript / Svelte Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`). No legacy `export let`,
  no stores-of-stores. Shared reactive state lives in `.svelte.ts` modules.
- Strict TypeScript. No `any` in exported signatures; model API payloads in
  `src/entity/api/types.ts`.
- Components are small and presentational; data fetching lives in `src/control/api/` and
  `src/control/state/`.
- No user-visible string literals in components — every one comes from `t('…')`
  (see **Internationalization** above).
- Type sizes are `rem` (`font-size` and `line-height`, measured px ÷ 16), so text follows the reader's own
  font size the way Android's `sp` does; boxes, icons and spacing stay px (Android's `dp`).
- CSS: scoped component styles plus design tokens from `src/boundary/styles/tokens.css`.
  Never hard-code a note palette color outside `src/boundary/styles/palette.css`.

## Security Rules

- Never log passwords, session tokens, or raw `Set-Cookie` headers.
- Every note query must be scoped by the requesting user's access (owner or share).
  Never trust a `noteId` from the client without re-checking access.
- Password hashing uses PBKDF2-HMAC-SHA256 with a per-user random salt (JDK only, no extra dependency).
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `NOTKA_COOKIE_SECURE=true`.
- **One administrator**, created from `NOTKA_ADMIN_USERNAME`/`NOTKA_ADMIN_PASSWORD` on the first start
  of an instance that has none, and never from the environment again. Every `/api/admin` route checks
  `AdminService.requireAdmin` itself — the hidden menu entry is a convenience, not the guard. The
  administrator's own account cannot be deleted or reset from the server settings.
- Sign-up starts **closed** (`server_settings`), and only the administrator opens it.
- A password reset stores only the hash of its token, puts the token in the link's **fragment**
  (never sent to a server, so never logged), is built from `NOTKA_PUBLIC_URL` (never from `Host`),
  and voids the old password only after the mail server accepted the message.
- Theme pictures are served from this origin, so they go out with a `sandbox` CSP; a theme's files
  are recognised by their bytes, as note pictures are.

## Testing

- Add or update tests alongside code changes.
- Match the existing testing framework and style already used in the touched module
  (Kotlin: `kotlin-test` + JUnit 5; frontend: `svelte-check` and, where practical, Vitest).
- Structure every test body with explicit **`// given`**, **`// when`**, **`// then`**
  section comments (BDD-style Arrange/Act/Assert). Each section must be present even
  if a phase is trivial (e.g. `// given: no fixtures required`); this keeps intent
  obvious at a glance. Skip a section only when it genuinely does not apply
  (e.g. a pure `// when` + `// then` smoke test with no setup).

## Product Rules That Must Not Regress

1. A note is either a **text note** or a **list note** (checkboxes). The mode is stored as `kind`.
2. Note content is stored as a **structured block document** (`NoteDocument`), never as opaque HTML.
   This keeps the Markdown export and import (`docs/MARKDOWN.md`) an exact conversion — the
   exchange format is Markdown, the stored format is not, and labels and metadata stay out of the
   note's content. See `docs/DATA-MODEL.md`.
3. The editor supports a **Markdown input subset**: `# `, `## `, `### `, `- `, `* `, `1. `, `[ ] `
   on line start, and `**bold**`, `*italic*`/`_italic_`, `~~strike~~`, `` `code` `` inline.
   The body is **Tiptap** (`@tiptap/core` + `svelte-tiptap`, MIT). Line splitting, list behaviour,
   checkboxes, keyboard shortcuts, input rules, undo history and paste handling belong to it —
   `boundary/components/RichText.svelte` only binds it to our document and to the Keep look. Do not
   write a second contenteditable engine; the hand-written one was deleted on purpose
   (`boundary/editor/render.ts`, `serialize.ts`). `entity/tiptapDocument.ts` translates between the
   stored `NoteDocument` and the ProseMirror document, and that stored shape stays the only thing we
   persist.
4. Lists nest **one level**, and no deeper: `NoteDocument.MAX_BLOCK_DEPTH` is **1**, in the entity on
   both sides of the API, because that is the original's own rule ("Google Keep also only allows one
   level of nesting"). A list line carries a `depth` (`0` is the top level) and Tab / Shift+Tab move
   it in and out; the card, the editor and the Markdown export all indent by it. Tab does nothing on
   a line that is already indented, and the server **refuses** a deeper line rather than clamping it —
   `NoteDocumentTest.aLineDeeperThanTheLimitIsRejected` reads the constant, so the guard follows it.
   Only list lines have a depth — an indented paragraph is rejected by the server.
   **The editor's list is flat too** (`boundary/editor/listRows.ts`), which is the original's own
   model and the one the stored document has always had: one line is one list item carrying its own
   `depth`, never a list nested inside an item. `TaskItem.configure({ nested: false })` and
   `FlatListItem` are both `paragraph+`, so a second level is not merely refused — there is nowhere to
   put it, in the schema or in a gesture. The tree it replaced is where every list bug came from, each
   one named by the owner: an item could be dragged to a second level, deleting a nested row left its
   empty list behind as a row with a checkbox and no text, and a row could not be detached on its own
   because dragging an item dragged everything nested under it. **Indenting means "sits under the row
   above"**: the first row of a list has nothing above it, so Tab there — and a drop at the top of the
   list — leaves the row at level 0.
5. Appearance = one of **11 predefined colors** plus an optional one of **9 predefined backgrounds**
   (`groceries`, `food`, `music`, `recipes`, `notes`, `places`, `travel`, `video`, `celebration` — the
   original's own nine, in its order), and the two are
   **independent choices**: the picker keeps the colour when a background is chosen and the background
   when a colour is chosen, each row with its own tick. It used to clear the other, which is the
   owner's "nie mam możliwości ustawienia jednocześnie tła i obrazka tła notatki jak w google keep".
   A background's own artwork is opaque and paints over the colour: the colour stays the note's own and
   comes back the moment the background is taken away, and `[data-background]` pins the ink for the
   theme, so no combination of the two can put dark text on a dark artwork. The backgrounds sit below a
   **one-pixel divider** in the picker (`--keep-border`) — the owner's "brakuje linii dzielącej kolory
   tła od teł" — and **each row's "none" swatch is the size of the swatches beside it**: the background
   row's was 32px where its tiles are 40, which the owner read off it at once ("ikona na No Background
   jest wyraźnie mniejsza od pozostałych elementów w tej linii"). **A background is an id; its picture
   is the reader's background theme** (`docs/THEMES.md`): the administrator uploads themes and sets the
   instance's default, and every account picks one for itself, kept on the server. The built-in theme is Notka's own CC0
   artwork in `frontend/public/backgrounds/<name>-<light|dark>.svg`; Google Keep's illustrations are
   an *external* theme in `themes/google-keep/`, never shipped with the app — do not move them back.
   A background covers the surface and crops to the card, so both theme variants come from
   `palette.css` (through the `--theme-*` properties an uploaded theme sets) and nothing in the
   components needs to know about them.

6. Appearance is a **property of the note**, not of a user (deliberately different from Google
   Keep, where colour is personal and never changes for anyone else):
   - everyone with access — owner, `VIEW`, `EDIT` — sees the same `color` and `background`;
   - anyone who can edit changes them **for everyone**; a `VIEW` collaborator cannot change them;
   - there is no per-user appearance state; do not reintroduce a `(note, user)` table for it.
7. Notes in the trash are permanently deleted **30 days** after `trashed_at`.
8. **Pictures are implemented**; drawings, voice notes and other media are not — do not build those.
   A note carries up to 20 pictures (PNG, JPEG, GIF, WebP, 10 MB each), stored **in SQLite**
   (`note_images`), so the database file stays the whole state. The server recognises a picture by
   its **own bytes** (`ImageFormats`), never by a name or a `Content-Type`; SVG is refused because it
   is a document that can carry script and pictures are served from this origin. Anyone who can edit
   adds and removes pictures, anyone who can see the note sees them, and they count against the
   storage of the note's **owner** (`NOTKA_MAX_IMAGE_STORAGE_MB`). Like the appearance a picture is
   not version-guarded and never a history entry, but adding or removing one moves the note's version
   on and publishes the change, so collaborators follow along. A copy copies them. They are drawn the
   original's way — above the title, edge to edge, in rows of at most three (`entity/imageLayout.ts`)
   — and open full size in `ImageViewer`. They are not part of the Markdown export yet.
   **Reminders are implemented.** A reminder is a moment (`reminder_at`) plus an optional rule for
   coming back (`reminder_repeat`: daily, weekly, monthly, yearly), and it is **metadata of the note**
   — the same for everyone with access, never version-guarded, never a history entry, exactly like the
   archive flag and the pin. A new note has none; `PATCH` sets one, and `reminderAt: 0` is the only way
   to say "take it away", because "leave it alone" and "there is none" have to be different
   instructions. The view is its own (`GET /api/notes?reminders=true`) rather than another `view`:
   its order is by the **reminder**, soonest first, which is the whole point of it — a time view, not
   an edited view. It gathers live notes the user can see, archived ones included and trashed ones
   never, and a moment in the past is shown rather than hidden (an overdue reminder is still a
   reminder). The picker, the bell and the chip come from the original's own screenshot and are
   measured in rule 19.
   **Labels are implemented and they filter.** Typing `#` in a note offers the reader's labels that
   match what follows it, and a new label by that name; picking one gives the note the label and takes
   the `#…` out of the text, as the original does (`boundary/editor/labelSuggestion.ts`, on Tiptap's own
   `@tiptap/suggestion`). A label belongs to exactly one account (it is never
   shared with a note's collaborators), a note can carry several, and both the sidebar and the chip on
   a card lead to `/labels/{id}` — the notes view filtered by that label. The filter is a query
   parameter the server applies (`GET /api/notes?labelId=`), so a stale client cannot show notes that
   do not carry it, and the same label id also narrows what is already loaded: a note whose label was
   just taken off it leaves a filtered view without waiting for a reload. Asking for a label that is
   not yours is `404 label.not_found`, not an empty list. A label's view keeps the composer, and a note
   written there is given that label — otherwise it would not match the view it was written in and
   would vanish from it the moment it was stored. A label's view **names the label in the header**,
   in the place the app's own name stands (measured from the original: `keep.google.com/#/label/Kreta`
   shows "Kreta" where "Keep" otherwise is), and the sidebar keeps the labels **with the navigation,
   directly under Reminders** — not as a section of its own below a divider, with `Edit labels` after
   them, which is what ours did. **A label's view also gathers that label's archived notes**, under an
   `ARCHIVE` heading below the live ones (measured from the original's `#/label/Kreta`: the archived
   cards are there, in that view, not only in the archive). The store therefore holds two lists for a
   label's view, and archiving — or trashing — a note from inside it moves that note between them
   without a reload. Both halves are asked for **together** (`Promise.all`), because a view that loaded
   one and failed the other is half a view: the archived notes would be missing, nothing would say so,
   and nothing would ask again — the view already counts as loaded.
9. The UI is fully localized in `en-US`, `en-GB`, and `pl`. Switching locale must change every
   visible string *and* the `Intl` formatting conventions without a page reload.
10. Live collaboration is **notifications over SSE plus REST writes**, never a second write path.
   `GET /api/events` carries a note id and a version, never content. A client re-reads through the
   ordinary REST endpoint, and ignores an event whose version it already has. Restyling or replacing
   the editor must not change that split.
   The stream commits its response **before** it has anything to say, and says something every few
   seconds after that: a keep-alive comment (`: keep-alive`, invisible to `EventSource.onmessage`).
   A stream that stays silent until the first change sends no headers at all, and everything in
   front of the server then decides it is dead and drops it — the Vite dev proxy at ten seconds,
   nginx at sixty — which the browser papers over by reconnecting for ever. Keep the interval under
   ten seconds.
   **A stream that was cut off is caught up, not trusted.** Nothing replays the notifications sent
   while it was down, so every `open` after the first — and the browser's `online` event — calls
   `notes.resync()`, which reads the view again and announces each note that came back newer.
   Our **own** notification is not a remote change: the server publishes before it answers, so the
   event regularly arrives while the write's response is still in flight and the store still holds
   the previous version. Anything comparing versions at that moment sees the author's own typing as
   somebody else's edit. `duringWrite` in `notes.svelte.ts` holds a note's events back until its
   write settles, then replays the newest — do not "simplify" it away.
   **The editor writes the body as ProseMirror steps** (`POST /api/notes/{id}/steps`,
   `prosemirror-collab`, `boundary/editor/collabSync.ts`; `docs/COLLABORATION.md`). The server orders
   them and never merges; an editor that is behind takes the steps it missed in and rebases its own
   over them, so two people typing at once both keep every keystroke and nobody is warned. Every
   exchange with the step log runs **one after another** (`serially` in `NoteEditor`): a catch-up that
   landed in the middle of a send would confirm the same steps twice. **A body is never pushed into an
   open editor**: it is loaded when a note is opened (never undoable) and changes afterwards only
   through steps — a document replacing the editor's whenever it changed is what could swallow
   keystrokes typed in the same moment.
11. `PATCH /api/notes/{id}` accepts an optional `version` and answers `409 note.version_conflict`
   when it is stale. It guards a body written **as a whole** — the offline queue's write of a note
   created offline — which also starts the note's step log again; the editor itself writes the body
   as steps (rule 10). Never send it for appearance, label, archive or pin changes, which cannot lose
   anyone's text and must not be blocked by someone else's typing.
12b. **On a phone the selection is the Android app's** (`PhoneSelectionBar.svelte`, measured on an
    emulator): a held card wears a 3dp ring and no tick, and the header becomes a 72dp bar with ✕, the
    bare count, pin, reminder, colour, labels and a ⋮ sheet (archive, delete, copy, select all,
    download). Every action is the single note's own REST call, once per picked note (rule 20).
    **Ticking a row animates the reorder** (`checklistCompletion.ts`): the rows and the heading slide
    into the room it leaves and the ticked row fades in under the heading, as the app's does.
    **An existing note opens on a phone without the caret** — it is opened to be read, the keyboard
    stays down — and a new note opens with it (rule 16 is the desktop's). **Ticking a row does not
    raise it either**: the checkbox toggles its row without focusing the editor, and only the text of
    an active row brings the caret (and the keyboard) in (`RichText.svelte`,
    `tickRowWithoutKeyboard`).
12a. **A card's "N completed items" heading is a label, not a control**: on a card a click anywhere opens
    the note, the heading and the line above it included (`NoteContent.svelte`). Folding the section is
    the editor's own (`completedSection.ts`). **The editor shows who a note is shared with** — the
    other people's avatars above its bottom bar (the owner's, for a collaborator) — and the owner's
    avatars open the collaborators.
12. Pinning is metadata, like the archive flag: it is a property of the note (everyone with access
   sees the same pin), it is never version-guarded and it never creates a history entry. Pinned notes
   lead every view, and the grid shows the **Pinned** and **Others** headings — which appear only
   once something is pinned — in the notes and archive views but never in the trash. A label's view
   adds one more: its archived notes under an `ARCHIVE` heading, because a label's view is one view
   rather than two. The server
   orders pinned first, so the client only decides where the headings go.
12b. **A link preview row's text is lighter than the note it sits on; its 56px thumbnail cell is
    not.** The fill is an *overlay* (`--keep-link-row`: 1.6% black in the light theme, 7.5% white in
    the dark one) starting where the thumbnail's cell ends, never a panel colour. Measured off the
    owner's screenshots of the original in both themes: `rgb(251,251,251)` on a white note,
    `rgb(49,50,53)` on `rgb(32,33,36)`. A card's rows are one block with `--keep-link-divider`
    hairlines; the editor's are separate raised cards under the "Edited" line. The numbers are in
    `docs/METRICS.md`.
    **Link previews are derived data, never stored beside the note.** The urls are read out of the
    note's own document — both spans that carry a `link` and addresses written plainly in the text —
    and the answer a site gives is cached in `link_previews`, keyed by the **address the note
    carries**, because that is whose property it is — *not* by wherever the site redirected us. A
    redirect target is a different key, and caching under it is how two of the owner's three links
    came back with no card while the table held their answers all along: the fetch followed
    `chipolo.net/…` and `gamesir.hk/…` to their real pages and stored those, and the read then asked
    for the addresses in the note. `resolve` therefore rewrites the card's url back to the requested
    one, and `LinkPreviewServiceTest` covers it. Removing a link from a note therefore removes its
    card, with no second place to keep in step. A read serves the cache and **never waits for a network**: the fetch is
    started by the write, in the background, at most **five** addresses per note.
    Fetching is the one place this server talks to a host a user chose, so it is deliberately
    suspicious: `http`/`https` only, every host — and every redirect hop — resolved first and refused
    when it answers with a loopback, private, link-local, multicast or IPv6 unique-local address,
    `followRedirects = false` with the check repeated per hop, a request timeout, a 256 KB cap on the
    body, `text/html` only, and a user agent that names the app. `LinkPreviewServiceTest` covers both
    halves of that: what is extracted, and which addresses are refused before a socket is opened.
    A page that cannot be reached, is not html, or says nothing about itself simply has no card; that
    is not an error and is never reported as one.
13. Version history archives the state a **content** write replaces (`title`, `kind`, `content`), not
   appearance changes, keeps at most 50 snapshots per note, and is readable by anyone who can see the
   note. The list endpoint carries no documents; fetch a single version only to download it.
14. The folded rail is Google Keep's, not a narrowed copy of the open sidebar:
    - the active icon sits in a **circle** (`--keep-rail-item-size`), not in a full-width shelf;
    - the **menu button lines up with the icon column** (`--keep-sidebar-collapsed-width`), so the
      icons do not move when the rail folds or unfolds;
    - hovering the folded rail **widens it to show the labels**, and it folds back when the pointer
      leaves. The widened rail floats over the notes — the aside itself keeps its folded width, so
      nothing underneath may move. This is a pointer affordance: it is behind `@media (hover: hover)`
      and must not appear on touch.
    - **Navigating leaves the column alone.** Only the narrow-layout drawer dismisses itself after a
      navigation, and Escape dismisses it too — the same overlay it is. `ui.narrow` tracks the
      stylesheet's breakpoint across resizes; do not fold the rail on a wide screen because someone
      clicked a nav item.
15. The app's own chrome is **not a document**: `user-select: none` on `body`, opted back in by
    `input`, `textarea`, `.editor`, `.note-body` and `[data-overlay]`. Without it a stray drag — or a
    double click on a card — paints a selection across the notes, which with the editor open looks
    like highlighting leaking out of it.
16. Opening the editor **puts the cursor where typing should start**: the **body**, for a new note
    as much as for an existing one. The original's "Take a note…" is its body's placeholder, and
    clicking it leaves the caret there (measured 2026-10-14; an earlier rule put it in the title).
    Without it the editor opens with nothing focused and the first keystrokes are lost. Focus from the **open** path only — reloading
    a draft because somebody else typed must never move the caret.
    **The editable is on the page before anything focuses it**: `RichText` mounts Tiptap's view into
    its host itself, synchronously (`mountEditor`, `{@attach}`), rather than through `svelte-tiptap`'s
    `EditorContent`, which moved it in after a tick of its own. The two ticks raced, and when the focus
    won it landed on an editable that was not on the page yet — the first letters typed into a new
    note went nowhere (measured: 7 times in 30, none in 40 since). The same place destroys the editor,
    which nothing did before. **And a closing note takes its caret with it** (`releaseCaret`, from
    every way the editor closes): the browser otherwise kept the selection, collapsed onto the left
    edge of the notes column, where a caret could blink after the note had closed.
    The editable **fills the whole body box** (`.rich-text` → its `note-body-host` →
    `.note-body`, all stretched): a click anywhere in the empty part of a note has to land in the
    editor, not on the container around it. And the editor draws **no focus ring** — it is excluded
    from the global `:focus-visible` rule, because a blue box around the line being typed reads as a
    stray selection.
17. **Motion is part of the look.** Keep's animations are what make the app feel like it, so the
    clone has its own set, all driven by the Material tokens in `boundary/editor/motion.ts` and
    `tokens.css` — never ad-hoc numbers:
    - a card **scales in** and **fades out** when it enters or leaves a view;
    - a note opened from the grid **grows out of its card**. A **new** note does not animate at all:
      measured frame by frame, the original's "Take a note…" box is 600×46 in one frame and the
      137px editor in the next — no transform, no fade — and abandoning it is just as instant. Ours
      grew out of the box with a vertical scale that squashed its text, which the owner saw as wrong;
    - the scrim under an edited note **fades**;
    - the rail's panel folds and peeks on the original's 150ms, while the grid takes its new room at once.
    Svelte's own transitions want an easing **function**, so `motion.ts` exports the Material curves
    a second time (`ENTER_EASING`/`EXIT_EASING`) rather than letting a second set of numbers appear.
    **The grid is laid out the original's way, by the app** (`entity/masonry.ts`, `NoteGrid`): fixed
    columns, and every note goes to the **shortest** column in its order, so the notes read left to
    right; each card is placed with `translate` on a 256px stride (measured off keep.google.com, which
    places its cards the same way). It replaced CSS multi-column layout, which fills columns top to
    bottom — the second note went *under* the first, a note that grew pushed others into another
    column, and a note changing sections had to be a second element — and with it the FLIP that had to
    measure the cards off the screen. One positioned block holds every section's heading and cards, so
    a note that is pinned, unpinned or archived in a label's view is **the same element sliding** to
    its new place, as the original's is.
    **A move is animated from the place the grid last gave the item**, never from a measurement: the
    positions are our own numbers, so there is nothing to read back, and an interrupted move starts
    from where the item is on screen. One duration for every move, the original's own **218ms**
    (`MOTION.regrid`) on the standard curve; a new card simply appears in its place (with its entrance)
    and a leaving one fades out *without* holding its room — it is out of the layout at once, so the
    others slide into its place while it fades. A card that changes height (a picture loading, a list
    folding, a link card arriving) is re-laid out by a `ResizeObserver`, and the notes under it slide.
    Two things must not move: a card under the pointer (Keep answers a hover with a deeper shadow
    only), and **nothing at all** while an existing note is being edited (rule 24's held note).
    **The columns are a fixed width, and the block is a whole number of them**: `--keep-card-min-width`
    wide with `--keep-grid-gap` between, centred, the leftover left over, and a column fits only with
    `--keep-grid-margin` free on both sides (the grid entry of `docs/METRICS.md`). Both are registered
    with `@property` in `tokens.css`, so the phone's `min()`/`calc()` width computes to pixels the script
    can read.
    **The rail's column changes width at once, and only its panel animates.** Measured off the
    original frame by frame (2026-10-15): the notes are in their new places in the same frame as the
    click on the menu button, and the rail's panel alone grows or shrinks — 150ms on the standard
    curve — over them. Ours used to animate the column itself over 250ms, which re-laid the whole page
    out on every frame and slid every card besides, and read as much less smooth than the original.
    So `.sidebar` takes its folded or open width immediately, `.rail` inside it is absolutely
    positioned and carries the transition, and the grid does **not** animate a re-deal caused by its
    room changing (the rail, a resized window) — only moves caused by the notes themselves (rule 17's
    pin, unpin, a card changing height). The narrow layout's drawer slides on the same 150ms curve.
    **Who decides whether to animate:** the app, not the stylesheet. `ui.applyMotion()` writes
    `data-motion` on the root from the system's `prefers-reduced-motion` unless Settings overrides
    it (`ui.motionOverride`, stored in `notka.motion`). Google Keep ignores the setting entirely;
    a clone should honour it by default and say so — silently honouring it is how "this app has no
    animations" becomes a bug report. Never read `matchMedia('(prefers-reduced-motion: reduce)')`
    directly again; ask `ui.animationsAllowed`.
    **The order is the original's** (`entity/noteOrder.ts`, the server's `position`): pinned first,
    then each section newest on top; a note that is pinned or unpinned goes to the top of where it
    lands, and **writing in a note never moves it** (measured: an edited note keeps its place in Keep,
    also after a reload). The store keeps every list in that order, which is safe while someone types
    precisely because typing does not change it. The original's Android app also lets the reader
    sort by **date created** or **date modified** (newest first, pinned still leading) from the
    search pill's sort button; that is a preference of this device (`notes.sort`, `notka.sort`),
    applied by the store, and "Custom (default)" is the order above. Under "Date modified" an edited
    note does move — the reader asked for that — but only once the editor lets go of it (rule 24).
    **In the custom order a card can be dragged into place** — native drag and drop (the
    "natively" rule above): a card moves within its own section, its place stays empty while it is in
    the hand and the cards around it make room, and the drop is `POST /api/notes/{id}/move` with the
    note it now stands above (or below). The server makes room by moving every note at that place or
    above up by one, so a collaborator who reads a note back at another position reads the whole view
    again (`applyRemoteChange`). Images and links inside a card are `draggable="false"`, or the browser
    would drag them instead of the card.
18. **Nothing is drawn outside a card from inside it.** `.card` clips (`overflow: hidden`) so its
    artwork and pictures end at the rounded corners; the selection tick box, which the original hangs
    off the card's corner, is therefore drawn by the **grid** (`.card-tick`, in the card's slot and
    centred on its corner), not by the card. It lives in the slot so that it moves with the card:
    measured once off the screen, it was left behind where a dragged card had been.
19. **Metrics come off the original, not out of the air.** Where Keep's look is a number, it was
    measured from a screenshot — pixels, not opinions. **The measurements themselves live in
    `docs/METRICS.md`**, with the window each was taken from, because `AGENTS.md` had grown past the
    size the agent harness delivers whole and the tail of these rules was being cut off. Read that
    file before changing a number, and change one only with a new measurement from the original; a
    measurement is overruled only by the owner looking at it, and when that happens say so there.
20. **Bulk selection** is Keep's: hovering a card shows a round tick box **centred on the card's
    corner**, drawn by the grid rather than the card (rule 18). Measured off the original: it is a
    **20px disc whose two colours invert with the theme**: the dark theme has the **light disc with a
    dark tick** (the measured pair, `rgb(255,255,255)` + `rgb(32,33,36)`), and the light theme the
    **dark disc with a white tick** (`rgb(32,33,36)` + `rgb(255,255,255)`, both read off the painted
    pixels at 4×). Ours took the dark theme's pair and used it in both, so the light theme showed a
    white disc; the owner read that off the original as wrong — "it should be black, not white". The
    two tokens are still *not* the theme's text colour: they are a fixed pair per theme, which is why
    an end-to-end check compares the two states instead of asserting one colour. And it is the
    **same disc before and after** the note is picked — picking it leaves the disc on permanently and
    adds the second light line around the card (`--keep-select-border`, drawn as `box-shadow` beside
    the existing 1px border so the card's box, and every note beside it, stays where it was). Not the
    note's own colours, and never a second, different hover glyph.
    Ticking one turns the header into a selection bar with a count and the bulk actions **for the view
    it is in** — pin, reminder, colour, archive and delete in the notes (with *Add label* and *Make a
    copy* in its ⋮), restore and delete-forever in the trash — with Keep's `Select all` in the bar's
    overflow menu, which picks exactly what the view is showing. Both bars, the phone's and the
    desktop's, do it through one `SelectionActions` (`boundary/components/selectionActions.svelte.ts`). Clicking
    further cards picks them instead of opening them, Escape clears it, and unticking the last one puts
    the bar away. Bulk actions go through the **same** REST calls as a single note — never a second
    write path — and the bar is not shown while a note is open.
    **A card's own box must not depend on the selection.** Every card's height decides where the notes
    after it go, so one card that changes height re-deals the ones after it: the picked note, and a handful of its neighbours, jump to other columns
    — and jump back when it is unticked, which is the owner's "dlaczego notatka 'Books to lend' po
    zaznaczeniu zmieniła miejsce? Po odznaczeniu wraca na pierwotne miejsce". Ours hid a card's link
    previews while notes were being picked ({#if !ui.selecting}), which made every card that has any
    shorter the moment a selection started. Picking is a state of the *view*, never of a note, so
    nothing about a card may change with it — and **while picking, a click anywhere on a card picks
    it, before anything inside the card acts**: a preview row, the pin and the menu all did their own
    thing under the reader's finger otherwise.
    **A picked note that leaves the list loses its tick.** Restoring one from the trash leaves its id
    behind otherwise, and the note comes back already picked in the notes view with the count including
    something that is not on screen; `ui.retainSelection` prunes the selection against what the view
    shows, and navigating clears it.
21. The **editor's title is 20px on a 24px line** (re-measured from the original's DOM on 2026-10-13,
    where an older screenshot reading said 24px; a card's title is 20px on 25px), and the
    checklist checkbox is drawn rather than left to the browser: `appearance: none`, a **14px** box
    with a 1.5px border and a 3px radius (measured off the original — it was 18px, which the owner
    read as too big next to the screenshot), and when it is ticked the box fills with the note's own
    foreground
    while the tick is cut out in the note's own **background** — so a plain note in the light theme
    is dark with a white tick, and the same note in the dark theme is light with a dark tick. A
    hard-coded white tick is what was wrong before: on a dark card the fill is light, and a white
    tick on it is invisible. `accent-color` alone left the platform's control there, which is what
    looked wrong next to the original.
    The editor's checklist is Keep's in two more ways, and both live in
    `boundary/editor/checklistCompletion.ts`:
    - **Completed rows are drawn at the bottom of their list, and stay where they are in the note**,
      under a foldable "N completed items" heading — the Android app's own model (recorded on an
      emulator): its items carry a parent and a checked flag, and "Checked items" is a way of showing
      them. A ticked nested row keeps its parent, which stays in the active rows and is drawn again,
      **greyed and uncounted, above it in the completed section**; unticking a row puts it back where it
      always was; ticking (or unticking) a top-level row does the same to the rows under it. One pure
      rule decides the two sections, for the editor and the card alike
      (`entity/checklistSections.ts`), and the editor draws them with CSS — the list is a flex column
      and every row, the "+ List item" row, the heading and the greyed parents carry an `order` — so
      the document, the caret and the history never see a row move. **This replaced moving a ticked
      row to the end of the document**, which lost a nested row's parent: the only link a flat row has
      to its parent is the row above it. A drag works on the active rows only; a row dropped after a
      parent goes after the parent's ticked rows, and a parent carried elsewhere takes them along.
      Tiptap's own DragHandle extension was considered and rejected: it drags any block with its own
      floating handle and drop indicator, and would add `@floating-ui/dom` for the privilege.
    - **A six-dot handle in the row's left margin** carries a row — that row alone, because a list
      line is one flat item (rule 4) — to another place in its list. Measured from the owner's
      screenshot of the original: it is **always there** on an active row while the note is edited —
      not only under the pointer, which is also why it must not follow the hover: a handle that
      appears and disappears with the pointer vanishes under the cursor as soon as you reach for it,
      because it hangs *outside* the row. A **completed** row carries none (it has folded to the
      bottom of its list; uncheck it to move it). Its centre sits **14.5px left of the checkbox**, and
      the editor indents its checklist so that the checkbox is **26px from the note's edge** — the
      note's body carries 16px of padding and the list the remaining 10 — which is what leaves the
      handle a margin to hang in rather than a strip of the note's border. The positions come from
      `offsetLeft`/`offsetTop` relative to the positioned wrapper — reading a container's
      `getBoundingClientRect` while the editor was still animating in is what once put every handle in
      the corner, and re-measuring from Tiptap's `onUpdate` is what made one title edit write the note
      three times.
      Three more things were wrong and all three were measured:
      - **A handle belongs to its own row, at every depth.** Its ink's centre sits **14.5px** left of
        **that row's** checkbox (measured: our dots at x=6..13 where the original's are 7..16) and it
        moves with the row when the row is indented — the owner's correction of an earlier reading
        that put every handle in one column, anchored to the outermost list's first row, which left a
        nested row's handle stranded far to the left of it. The glyph is **18px** in an 18px box, which
        paints the original's own ~10px six-dot; the 16px it was is what the owner read as "the icon
        is too small", and the 20px it became was measured against the original and found too wide.
        The row's own content start is the anchor — not the list's `offsetLeft`, which carries the
        checklist's own padding and once put every handle 4px from the note's edge.
      - **A handle is level with its row's *line*.** It is placed from the row's `label`, which is the
        checkbox and therefore the first line: a row of three lines is three lines tall, and the
        original's handle sits on the first of them.
      - **The handles stay on screen while one is held.** They were hidden the moment the drag began
        (`{#if !dragging}`), which is both what the owner saw — "they vanish when I grab them" — and
        what made dragging only sometimes take: the element under the pointer left the DOM mid
        gesture. The held one carries `.held`, and the handle takes **pointer capture** so a re-render
        or a pointer that wanders off the note cannot end the drag.
      **A grab is not yet a drag.** Nothing happens until the pointer has travelled past the
      platform's own slop, **8px** — that number is not a measurement of the original (a still
      screenshot cannot show a threshold) but Material's `ViewConfiguration.getScaledTouchSlop()`,
      which is also what a browser uses to tell a click from a drag. Below it the row is not
      highlighted and does not move, so a plain click on the handle is harmless; the handle does show
      `.held` from the press, so the grab is visibly accepted.
      **There is one gesture, and the row never leaves the list.** Measured off the owner's own four
      screenshots of the original (`keep-drag-{1-resting,2-grab,3-move,4-drop}.webp`): the
      carried row is not lifted out, not copied and not replaced by a hole — it stays a row of the
      list, the rows around it make room for it, and it is marked with a single band. Three other
      mechanisms were built here and thrown away, each named by the owner: a `Decoration.widget` gap
      ("a ghost of the position"), a floating copy of the row ("a ghost of the element"), and a
      two-mode gesture (sideways = indent in place, up/down = carry) that made a nested drag
      unreadable.
      - **What a drag draws is one band, and it is the row's own box.** `rgb(31,33,37)` — an opaque,
        neutral dark that does not take the note's colour — running the note's full width with the
        row's handle, checkbox, text (however many lines) and ✕ **on** it, in light ink
        `rgb(239,241,245)`. Its height is exactly the carried row's: measured, **84px** around a
        three-line row there, which is that row's own line height and padding and not a pixel of its
        neighbours'. (The tree this replaced made the band as tall as everything nested under the row,
        which the owner saw at once.)
      - **The band is its own element, and it reaches the note's own edges by measurement.** It is
        `.drag-band`, drawn by the component from the card's rectangle; the row itself only carries the
        band's ink. It has to be separate because **the row is drawn at the level it will land at** —
        the original's carried row sits at the nested column in `2-grab` and at the top level in
        `3-move` — and a band painted by the row (a background, or a spread shadow) travels with it and
        leaves a strip of the note beside it. That strip, with the handle's own dark box poking out of
        it, is the **vertical line** the owner found in the first screenshot of this state; the 22px
        of shadow that produced it was a guess, and the card's padding is not ours to guess.
      - **The list is laid out once, and the document is not touched until the row is dropped.** The
        rows keep the places they had when the hand took hold; the carried row is drawn under the hand
        with a `transform`, and the rows that give way are drawn one row further along, animated on
        Material's short duration and standard curve. Nothing is re-measured and nothing is written
        while the hand moves, so there is no feedback for the next pointer position to fall into —
        which is what every earlier attempt got wrong: a live reorder per pointer move made the place
        depend on the place it had just been given (measured: the row ran to the top of the list and
        lost its indentation), and the whole note re-laid out under the pointer. It also makes the end
        of the gesture trivial: the drop is **one transaction** that writes the arrangement already on
        screen, one undo takes the whole drag back, and Escape writes nothing at all.
      - **The place is read from the list closed up over the row in the hand** — the frame that does
        not move for the whole gesture — and never from where the carried row is drawn. The row lands
        in the gap the hand is over: every row of that frame whose own middle is above the carried
        row's middle is a row it stands after. A rule that compared the hand against the rows as they
        move has **two answers for one hand position** (the rows move *because* of the answer), which
        is the imprecision the owner kept hitting; this one is a step function of the hand alone, so
        the row lands where it is drawn and the empty space in the list is where it will go.
      - **The level is the gesture's own starting level, moved by the hand's sideways travel**, half a
        level a side (`round(dx / 25px)`, measured: one level is 25px), clamped to
        `MAX_BLOCK_DEPTH`. A drag that keeps the hand still keeps the row's level — the original's
        carried row stays indented as it travels — and a deliberate pull to either side changes it. A
        row at the very top of the list is at level 0, because there is nothing above it to sit under.
      **Tab changes the row's own level, and stops at one.** `boundary/editor/listRows.ts` binds Tab
      and Shift-Tab to the row's `depth` attribute and **consumes** the key either way, because the
      browser's own Tab would move the focus out of the note. There is no depth guard left to write:
      the schema cannot express a second level (rule 4), so the editor, the drag and the server cannot
      disagree — the `ListDepthLimit` extension that used to guard the tree is gone with it.
      **Escape belongs to the row in the hand first.** The editor closes the note on Escape from a
      window listener in the **capture** phase, so it asks `RichText.isCarrying()` and lets the drag
      have the key; otherwise abandoning a drag would finish the note instead.
      The **proportions** are the original's own, measured from the same screenshots and from ours the
      same way (from a screenshot, not from the DOM — see `docs/METRICS.md`): rows **38px** apart, a
      **14px** checkbox whose left edge is **26px** from the note's edge, the row's text at **53px**,
      one nesting level **25px** wide, and a six-dot handle about **10px** wide with its left edge
      **7px** from the note's edge, keeping **14.5px** between its centre and the checkbox. A row's box
      is its line — 24px — plus the original's own **7px** of air above and below, so its text sits in
      the middle of its box and a second line makes the row 24px taller rather than shifting what is
      already written. Those are distances **from the note's own edge**, which is the only frame the
      original's numbers are in: the note's body carries 16px of its own padding, so the list adds the
      remaining **10px**, and the title sits at the 16px the original puts it at. Writing the 26px into
      the list itself put every row 16px right of the original's — the side-by-side is what caught it.
    **The note's own top right corner is its pin.** Measured off the original
    (`keep-drag-1-resting.webp`: one icon at x=572..585 of a note ending at 607, the same shape as its
    card pin), the editor's corner holds the **pin**, and the reminder is one of the **bottom bar's**
    actions — the third from the left, after the colour and before the collaborator. Ours had the
    reminder's bell up there and the pin down in the bar, which the owner corrected: "in Google Keep
    the top right corner has the note's pin, not the reminder".
    The heading exists twice on purpose — a card's is a component (`NoteContent.svelte`) and the
    editor's is a ProseMirror decoration — and the two share their class names and their chevron
    (`boundary/editor/completedSection.ts`, with `completedSection.test.ts` failing when either side
    renames one) but **not** their sizes: a card's heading is the compact one and the editor's has the
    room the editable gives it. Unifying the numbers would make one of the two wrong.
22. The type is Keep's stack: **Google Sans**, then **Roboto**. Both ship with the app
    (`@fontsource/google-sans` and `@fontsource/roboto`, weights 400/500/700, `latin` **and**
    `latin-ext` — without the second subset the Polish diacritics fall back to another face). Google
    Sans is on Google Fonts under the **SIL Open Font License**, which is what makes bundling it
    legitimate; do not link it from Google's CDN instead, because a self-hosted, offline-installable
    app should not call Google on every load. `--keep-font` is the only place the family is named.
23. Demo mode is `DEMO=true`, and it is a **demo**: `DemoData` seeds two sample accounts — Alice is the
    instance's administrator, so a demo needs no `NOTKA_ADMIN_*` — each with
    about ten notes across colours, backgrounds and nesting, plus two notes they share (a checklist
    and a text note). The seed runs only on an
    instance with **no accounts at all**, so restarting a demo never duplicates anything; the sample
    credentials live in `DemoData` and reach the sign-in screen through `GET /api/health`, which must
    advertise them **only** while `demo` is set. Never point it at data anybody cares about.
24. Editing has **two presentations**, both taken from Google Keep, and `ui.editorOrigin` decides:
   - `composer` (a new note): the editor takes the place of the "Take a note…" box, no dimming.
   - `note` (an existing note): the card **floats over the notes** with the app dimmed behind it, the
     composer stays visible above it, and **not one card underneath may move** — measure absolute
     positions, never grid-relative ones, when testing that.
   For a new note the editor keeps the **composer's own frame**: the same 1px `--keep-border` and the
   same `--keep-shadow-composer`, and it is **as tall as what is in it** (the original's measures 137px
   empty: the title, one line of body showing the "Take a note…" placeholder, the bar), so the box
   simply becomes the editor; a note opened from the grid keeps the editor's lift, because that one
   really is floating.
   **A draft never reaches the grid before the editor owns it.** `NotesState.create` only creates the
   note on the server; the editor claims the id and *then* adds it (`notes.add`). Adding it first is
   what made the grid draw the new card the moment the first autosave stored the draft — while the
   editor still had no id for it, so the grid's "hide the note being written" filter did not match it
   — and the card then played its 150ms exit transition, pushing the notes below it down and letting
   them slide back while the author was still typing. Every creation path goes through those two calls
   in that order.
   **How the editor is presented and which note it owns are two facts, not one.** `ui.editorOrigin`
   (`'composer' | 'note' | null`) says how it is presented and whether it is open at all;
   `ui.editorNoteId` holds a real id or `null` for a draft that has not been saved yet. They used to be
   one field with `0` meaning "a brand new note", which made `0` mean two things at once and is what
   the grid filter above tripped over. Within the editor, the draft is tracked by `loadedTarget` — the
   note's id as a string, or `'new'` — for the same reason: `null` cannot mean both "closed" and
   "brand new". Read `ui.inComposer` / `ui.floatingEditor` rather than comparing the origin by hand.
   **A document pushed into the editor is never undoable** (`RichText`'s `addToHistory: false`):
   opening a note, adopting somebody else's edit or a list action from the ⋮ is not the reader's
   typing. Recorded in the history, Undo was enabled the moment a note opened, and pressing it took the
   editor back to the empty document it held before — which the autosave stored over the note.
   **What has been typed, and what the server has, are `NoteDraft`'s business**
   (`boundary/editor/noteDraft.svelte.ts`): the fields, `serialize`/`isDirty`/`hasContent`, taking a
   note over (`adopt`) or starting one (`startNew`), and the autosave timer. Writing to the server is
   *not* there — it needs the stores, the toasts and the session's identity, so `save()` stays in the
   component. The body's unsent steps are the collaboration plugin's to know (`draft.hasUnsentBody`);
   the draft compares only the title and the kind. `markStored(text)` takes what a write actually
   sent, not what is in the editor when the reply lands: the writer may have typed on in the
   meantime, and marking that as stored is what keeps the later keystrokes dirty.
   In both, clicking anywhere outside the editing **card** (its own popovers and dialogs excepted)
   finishes the note and settles it into the grid, and so does Escape — **unless the server refused
   what was typed** (a lost permission, a deleted note — somebody else writing first is not a
   refusal, it is merged): then the editor holds it (`ui.editorHoldsUnsaved`) and refuses to close or
   to give way to another note until the user discards it. Without a connection nothing is
   refused — the write is queued (rule 25) and the note closes as usual. The edited note leaves the
   grid while it is open but **keeps its box**, and grows out of that card into the editor with a
   scale animation. That box is the note **as it was when it was opened** (`held` in `NoteGrid`):
   following every autosave made the hidden card change height under the editor and re-dealt the
   notes beneath it while the owner typed. The grid takes in what was written when the editor closes. Do not treat the full-width host as "inside the editor", and do not let the
   floating card collapse to zero height — as a stretched flex item in an absolutely positioned host
   its height would depend on the host's, which depends on the card's.
   **The floating editor hangs from the viewport, not from the composer.** Anchoring it to the
   composer put the note wherever the page happened to be scrolled, so opening a card from a scrolled
   list opened the note off the bottom of the screen; it is `position: fixed`, centred on the window
   (measured: the original's modal is centred on the window, not on the notes column) with the room
   it needs left below it. **And the notes under it hold still:** with a note open the wheel scrolls
   the note and nothing else, the way the original does — only a composer-origin editor is in the
   flow and free to scroll.
   **The veil is the theme's own background, not black** (`--keep-scrim`, 73%, measured) — in the
   dark theme. The light theme's, measured from the original's DOM, is `rgb(32,33,36)` at 60%. The page
   background in the original keeps its colour while everything drawn on it — text, cards, the rail —
   fades, which no black scrim can do: measured pairs are a card title at 241 → 88, the rail's active
   pill at (65,51,28) → (40,38,34), and the background at 31 → 31, all reproduced by
   `c × 0.27 + 32 × 0.73`.
   **Finishing a new note flies the editor onto the card it becomes**, and the whole close is *one*
   layout change: `ui.settling` reveals the note's slot (a note still being composed is left out of
   the grid) and `.editor-host.settling` gives the composer's room back in the same update, so the
   grid is final when the flight starts. Two changes instead of one is what made this look chaotic:
   the notes slid down to make room, then the room came back and slid them up again.
   Two details are load-bearing.
   - **The flight aims at the card's *layout* box.** A card that is still animating in carries a
     scale, which `getBoundingClientRect` folds into the rectangle — measuring that way stopped the
     flight a few pixels short of the card.
   - **It eases with `MOTION.standard`, not the exit curve**, and carries `fill: 'forwards'`. An
     accelerating curve covers most of the distance in its last frames (the note slammed into the
     grid), and without `forwards` the card flashes back to full size over the grid for the frames
     before it closes. The host is unclipped while the card travels.
   The new card's arrival moves the notes after it the grid's ordinary way (rule 17): they slide to
   their new places once, while the editor flies onto the card.
   The choreography itself lives in `boundary/editor/editorFlight.ts` (`layoutRect`,
   `flyToCard`), and every function there takes the elements it
   moves: the component decides *whether* to animate, that module decides *how*. Keep new animation
   there rather than back in the component.
25. **The installed app works offline.** The service worker caches the shell — the page and every chunk
   of its script and stylesheet (the editor and the zip library are chunks of their own, loaded after
   the start), and the fonts, read from the build's manifest when it installs — and never the API.
   The notes are the app's own business, because only the app knows whose they are: `localStore`
   (IndexedDB, through `idb`) keeps the signed-in account, its labels and every view it opened, and
   a view that cannot be fetched is filled from there. **A write that cannot be sent is queued, not
   failed** (`pendingWrites`): text, appearance, pin, archive, reminder and labels of a note, and a
   new note (with a local, negative id), are shown as they will be and sent, in order, once the
   server answers — on the browser's `online`, on the live channel's reconnect, at sign-in and from
   the header's button. The queue belongs to one account and survives a reload and an expired
   session; signing out wipes the device. A queued text change is the editor's **steps** (rule 10), so
   somebody else's steps written meanwhile do not refuse it: while the editor that made them is still
   open it takes those in and sends its own again, and only a closed editor's steps that no longer fit
   are kept aside. **Nothing typed is ever dropped**: a queued text change the server refuses
   (somebody removed the note, renamed it meanwhile — `titleBase` — or wrote steps a closed editor can
   no longer be rebased over) becomes a note of its own, and the user is told. Pictures, sharing, the trash and the settings stay online-only.
   **A share from another app is a new note** (the manifest's `share_target`, `docs/ARCHITECTURE.md`):
   the service worker keeps it, so it is received offline too, and it goes through `create` + `add`
   like any other new note — its pictures, being online-only, are left out offline and the reader is
   told. Where the original
   shows its "offline" cloud, the header shows ours (`connection.reachable`), on a phone as well.
26. **A phone is the original's Android app, not a narrow web page.** Below the 600px breakpoint the
   chrome is the app's (measured in `docs/METRICS.md`, "The app's own chrome"): cards with no pin and
   no action bar, picked by a held finger; the layout and sort switches inside the search pill and
   the settings in the drawer; one "+" that opens a menu of kinds of note; and the editor's colours,
   its "add" button and its ⋮ menu as **bottom sheets** (`Sheet.svelte`, a bits-ui Dialog) rather than
   popovers; **the system's own bar wears whatever is at the top of the screen** — the page, the open
   note's colour, the veil of a sheet or a menu — from `boundary/systemBar.ts`, which samples the top
   edge (a surface on its way counts by how much of the status bar's band it covers, so the bar fades
   to the open note's colour as the note slides in under it) rather than listing states; an installed web app cannot
   draw under the status bar, but `theme-color` makes the bar part of the screen. **Android's app
   (`apk/`) does draw under both bars**: an open note's colour and picture reach behind the clock, the
   bar only takes icons that suit what is under it (`StatusBar.setStyle`, from the same sampling), and
   everything at the screen's top or bottom edge keeps clear of the bars by `--keep-inset-top` /
   `--keep-inset-bottom` — zero in a browser. A new full-screen surface needs them too. Its "A" opens a formatting bar (H1, H2, plain text, bold, italic, underline) and a list
   note's title carries a ⋮ with the list's own actions. Desktop keeps the web original's widgets. Branch on `ui.phone` in markup, and keep a
   phone number that the script also needs (the checklist's `PHONE_LIST_EM`) in one place.
