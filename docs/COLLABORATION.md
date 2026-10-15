# Live collaboration

Status: **implemented**. This document is the design of record: every stage below is built and
covered, and the sections that argued for the design are kept because they are why it looks the way
it does.

## What the original does

Google Keep's own documentation says only that a shared note can be *edited* by the people you
share it with ([Share notes](https://support.google.com/keep/answer/6101196)), and its public
Workspace API models a note with `updateTime` but **no `etag` or version**
([REST Resource: notes](https://developers.google.com/workspace/keep/api/reference/rest/v1/notes)).
Neither source describes the web client's sync, and neither is authoritative about it: the help
pages are written for end users, and the public API is a restricted subset of what the product
does.

**Observed behaviour in the real product** (first-hand, from the project owner): two people can
edit one note at the same time and an open note view refreshes on its own as the other person
types. There are no collaborator cursors or presence indicators — those exist in Docs, not Keep.

So the target is:

| | Keep | This project |
| --- | --- | --- |
| Shared note can be edited by several accounts | yes | yes, already |
| An open note picks up someone else's edit without a manual refresh | **yes** | **yes** |
| Simultaneous typing merged, keystroke by keystroke | no — by report the text can end up glued together | **yes** (the step log) |
| Collaborator cursors and presence | no | no |

## Why not a CRDT

The first plan was a Yjs relay with a `y-prosemirror` editor. That would have been a bigger,
more expensive version of a feature the original implements without character-level merging:

- Keep's observable behaviour is "the note view refreshes live", not "two cursors merge text";
- a CRDT drags in Yjs, `y-protocols`, ProseMirror and a rewritten editor surface — for a
  behaviour that a change-notification channel reproduces;
- the editor we have (Tiptap over `NoteDocument`, with the translation in `entity/tiptapDocument.ts`)
  stays untouched, which is the KISS answer.

Simultaneous typing *is* merged now, but with ProseMirror's own step protocol over the REST write
path (below), which needs none of that. A CRDT remains the tool for Docs-style collaborator cursors,
which neither the original nor this project has.

## Design: notifications over SSE, writes over REST

```
  Browser A ──PATCH /api/notes/42──▶ Ktor ──▶ SQLite
                                       │
                                       └─ publish note.changed(42)
                                              │
  Browser B ◀──GET /api/events (SSE)──────────┘   then re-reads /api/notes/42
```

- **One SSE stream per signed-in user**: `GET /api/events`. It carries no note content, only
  `{"type":"note.changed","noteId":42,"version":7}` — a version, never a body, and never a
  connection id: a client tells its *own* write apart from somebody else's by the version it already
  holds (see `duringWrite` in `notes.svelte.ts`, rule 10).
- **Writes stay on the REST endpoints we already have.** No second write path, no new protocol.
- **On receipt the client re-reads what it cares about**: the note list entry, or the open editor,
  and only when the reporter is not the client itself.
- SSE rather than WebSockets because the channel is one-directional by construction. That buys
  automatic reconnection, plain HTTP with the existing session cookie, and no new client library.

### Why not push the content in the event

Because it duplicates the read path and creates a second source of truth. A version number is
enough to decide whether to re-read; the note body keeps coming from `GET /api/notes/{id}`.

### When the recipient is typing

The event still arrives, and the open editor takes the other writer's change in **without replacing
what is being typed** — see the step log below. There is no warning and nothing to reload.

## The body's step log: ProseMirror's collaboration protocol

The body is written as **ProseMirror steps**, with ProseMirror's own collaboration module
(`prosemirror-collab`, MIT) on the client and the server as its *central authority*:

```
  editor A ──POST /api/notes/42/steps {docVersion: 31, steps, content}──▶ Ktor: 31 is current → 32..33
  editor B ──POST /api/notes/42/steps {docVersion: 31, …}──────────────▶ 409 note.steps_behind
  editor B ──GET  /api/notes/42/steps?since=31──▶ A's two steps → receiveTransaction → resend at 33
```

- **The server orders, it never merges.** It numbers a note's steps (`note_steps`, the body's
  `docVersion`), accepts an editor's only on top of the version that editor has, and stores the body
  the editor sent with them in the same transaction. It never reads a step.
- **The editor merges.** A writer who is behind reads the steps it missed; `receiveTransaction`
  applies them and **rebases the writer's own unsent steps over them**, mapping the caret through
  both. Two people typing in different lines, or in the same line, both keep every keystroke, and the
  one still typing keeps typing where they were. Undo takes back only one's own steps.
- **An editor recognises its own steps by its `clientId`.** A write the offline queue delivered on its
  behalf comes back as a confirmation, not as new text.
- **The log is bounded.** The newest 1000 steps of a note are kept, and a body written as a whole
  (`PATCH` with `content`: the offline queue's write of a note created offline, a restored version)
  starts it again. An editor the log cannot reach — or whose steps do not fit its body — reads the
  note and lays what it typed over the server's body (`CollabSync.restart`), so nothing typed is lost
  then either.
- **Title and kind** go with the steps. A title changed elsewhere is taken over unless the reader
  changed their own since it was last stored; then theirs stands and goes out with the next write.
- **Opening a note is not an edit.** The body an editor loads is never in its undo history, and it is
  never pushed into the editor again while the note is open — every later change arrives as steps.
  The old "push a new document whenever it changes" path is what could replace keystrokes typed in the
  same moment, and what made Undo right after opening a note empty it.

The client side is `boundary/editor/collabSync.ts`, tested headless with two editors and an
authority in memory (`collabSync.test.ts`): different lines, the same line, the offline queue's
confirmation, a restart that keeps unsent text, steps that do not fit, and a body that reads back from
the stored document with every node the same size.

### Why this and not a CRDT

Yjs would give the same merging plus collaborator cursors, but it makes a binary CRDT state the
body's source of truth, needs its own sync channel, and turns the server into a relay of updates it
cannot validate. The step protocol keeps the server the authority over a body it stores as a
`NoteDocument`, keeps the REST write path and the live channel exactly as they are, and is the module
ProseMirror ships for this.

## Optimistic concurrency (independent of the channel)

`PATCH /api/notes/{id}` accepts an optional `version`. When present, the write only lands if the
stored row still carries it, otherwise the server answers `409` with
`key = note.version_conflict` and `params.noteId`. The editor no longer writes the body this way —
the step log above replaces it — but a body written as a whole (the offline queue's write of a note
created offline) still carries it, and appearance, label and archive changes still must not.

Covered by `NoteConcurrencyTest` (4 tests) and `NoteStepsTest` (5 tests).

## Schema

The stream itself needs no table: it is a fan-out of in-memory events, and a client that was
cut off re-reads on reconnect (`notes.resync`): every `open` of the stream after the first, and the
browser's own `online` event, read the view again and announce each note that came back newer —
the notifications sent during the gap are gone, so this is how they are made up. Nothing is
persisted, so trashing and the 30-day purge need no extra work.

## Stages

| # | Stage | Verification | State |
| --- | --- | --- | --- |
| 1 | Optimistic concurrency: `version` on the note, guarded `PATCH`, `409` | `NoteConcurrencyTest` | **done** |
| 2 | SSE endpoint, per-user event bus, publish on every write | Kotlin test: two subscribers, a write reaches the other one and not the writer | **done** |
| 3 | Client subscribes; list entries and an idle open editor refresh themselves | Playwright: two contexts, one types, the other's view changes with no manual refresh | **done** |
| 4 | Two people typing at once both keep their text: the body is written as ProseMirror steps over a server-ordered log, and the writer who is behind rebases | `NoteStepsTest`, `collabSync.test.ts`, Playwright `concurrency.mjs` (different lines, the same line) | **done** |
| 5 | Version history, as in Keep: previous states listed and downloadable | `NoteHistoryTest` + `pnpm run e2e` | **done** |
| 6 | A client that was cut off catches up when it is back | Playwright (`live.mjs`): a change made while the collaborator was offline reaches them with no reload | **done** |
| 7 | Text that could not be stored is never thrown away: without a connection it is queued on the device and sent later (`AGENTS.md` rule 25); a refusal keeps the editor open until it is stored or discarded | Playwright: `live.mjs` (offline, an offline write meeting another one) | **done** |

## Risks

- **Event fan-out is per process.** One container is the deployment model, so in-memory is enough;
  running several replicas would need a shared bus. Documented, not built.
- **Reconnect storms** after a restart: the client re-reads on reconnect, which is idempotent.
- **Version history grows**: capped at the newest 50 snapshots per note (rule 13).

## What simultaneous typing does today

It is merged, keystroke by keystroke (the step log above), with nobody warned and nothing reloaded.
The original by first-hand report can leave both writers looking at text glued together from both
versions; ours converges on one body that carries both. Collaborator cursors and presence are a Docs
feature, not a Keep one, and remain out of scope.

## Defects this work uncovered

None of these showed up in a unit test; they are recorded here because they are easy to
reintroduce:

- **Closing the editor threw away text that had not been stored.** `close()` saved and then closed
  whatever the save said: a refused write (a conflict, a lost connection) left the typed text only
  in the editor, and closing it — or opening another note — replaced it. A write that cannot reach the
  server is now queued on the device (`pendingWrites`) and sent once it can; a write the server
  *refuses* makes the editor hold the draft (`ui.editorHoldsUnsaved`): it stays open, says why, and
  the only ways out are taking the other version or "Discard changes".
- **A dropped live channel was never caught up.** The browser reconnects an `EventSource` by itself,
  but nothing re-read what was missed, so the list stayed stale until a reload and the first edit
  ended in a conflict. See **Schema** above.
- **A failed request surfaced as the browser's "Failed to fetch".** The API client now turns a
  request that never got an answer into an `ApiError` with the key `request.unreachable`, so it is
  translated like every other error and can be told apart from a refusal.

1. **Toasts were unclickable while a dialog was open.** A modal dialog sets
   `pointer-events: none` on everything outside itself, and svelte-sonner renders its toaster
   outside the dialog, so the action button resolved to `pointer-events: none` and the click fell
   through to the backdrop. `boundary/styles/global.css` re-enables the property on
   `[data-sonner-toaster]`.
2. **Clicking a toast closed the dialog behind it.** To bits-ui the toast is outside the dialog, so
   the click counted as "interacted outside" and dismissed the dialog mid-interaction.
   `Dialog.svelte` cancels `onInteractOutside` when the event originates inside the toaster.
3. **A brand new note wiped its own editor on the first autosave** (reported by the owner). The
   autosave turns the draft into a stored note, but `ui.editorNoteId` still said "a brand new note"
   while `reloadFromServer` had moved `loadedId` to the new note id. The effect that loads a note
   compared the two, saw a mismatch, and loaded a *new* note over the draft — so the editor emptied
   and typing in it created a second note. `save()` now moves both markers together, and
   `reloadFromServer` leaves `loadedId` alone. A related annoyance went with it: a save echoing back
   through the live channel no longer re-renders the blocks when the content is identical, which used
   to move the caret out from under whoever was typing. Covered by the `e2e` check *a new note keeps
   its draft when the autosave creates it*.
4. **A closed SSE stream was reported as a server error.** The browser closing an `EventSource` —
   which happens on every navigation, reload, and sleep — leaves the next write on a channel nobody
   reads. The exception escaped the handler, so Ktor logged an `ERROR` and answered a stream that had
   already finished with `500`. `mirrorToClient` in `EventRoutes.kt` now treats a closed channel as
   the normal end of a stream, and it takes a plain `send` rather than a Ktor session, which is what
   makes that ending testable without standing one up.

## Verification

| Suite | Command | Result |
| --- | --- | --- |
| Backend unit + HTTP | `./gradlew :backend:test` | 206 tests, 0 failures (`NoteStepsTest`: 5) |
| The step protocol, headless | `pnpm run test` (`collabSync.test.ts`) | 6 tests |
| Live channel | `pnpm run e2e:live` | 11 checks |
| Simultaneous typing | `pnpm run e2e:concurrency` | 7 checks |
| Full app regression | `pnpm run e2e` | 149 checks |
| Editor interactions | `pnpm run e2e:editor` | 57 checks |

The browser suites live in `frontend/e2e/` with their own README; they are part of the repository
rather than a scratch directory, because they are the only place where the live channel and the
conflict path are actually exercised.
