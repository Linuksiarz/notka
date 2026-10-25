# Data Model

SQLite is the only supported database. All timestamps are stored as **epoch milliseconds**
(`INTEGER`) so no date/time conversion library is required on either side.

## SQLite pragmas

The JDBC URL used by the backend is:

```
jdbc:sqlite:<db-file>?journal_mode=WAL&busy_timeout=5000&foreign_keys=on&synchronous=NORMAL
```

WAL mode plus `busy_timeout` is what lets Ktor's worker threads read while a write is in flight.

## Tables

Schema creation lives in
`backend/src/main/kotlin/dev/duwe/notka/entity/persistence/Migrations.kt`. There is **one
idempotent bootstrap**: a list of `CREATE TABLE IF NOT EXISTS` statements plus the indexes, executed
**on every startup**. That is what lets a table added later appear in a database created earlier;
skipping the statements because `PRAGMA user_version` was already set once left a running instance
without `link_previews`. The marker itself is only used to tell "empty database file" apart from
"already initialised" — there is no upgrade path, because nothing has been deployed yet. Changing a
column means editing the statements; a development database carrying the old shape is deleted.
At every start the tables are compared with the statements (built once in memory), and a database
whose tables have another shape is refused with a message saying so, rather than failing on the first
query that reads a missing column.

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `email` | TEXT UNIQUE | stored lowercase, trimmed; every signed-up account has one |
| `username` | TEXT UNIQUE COLLATE NOCASE | only the administrator created from `NOTKA_ADMIN_USERNAME` has one |
| `display_name` | TEXT NOT NULL | |
| `password_hash` | TEXT NOT NULL | `pbkdf2-sha256$<iterations>$<salt-b64>$<hash-b64>` |
| `is_admin` | INTEGER NOT NULL DEFAULT 0 | the instance's administrator |
| `background_theme` | TEXT | the account's own background theme; `NULL` follows the server default |
| `created_at` | INTEGER NOT NULL | epoch millis |

`CHECK (email IS NOT NULL OR username IS NOT NULL)`: an account always has something to sign in with.

### `user_avatars`

An account's own picture, one row or none, in the database like a note's pictures. Always **JPEG XL**:
the browser crops and encodes it before the upload, so the server stores the bytes it was given —
recognised from their header (`ImageFormats.sniffJpegXl`), never from a name or a `Content-Type` — and
converts nothing. The browser draws it itself; one that cannot shows the initials, and is told at
start that it is not a supported browser (`docs/PLATFORMS.md`).

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | INTEGER PK | FK `users(id)` ON DELETE CASCADE |
| `data` | BLOB NOT NULL | the JPEG XL as uploaded: at most 512 KB and 1024 px a side (the client sends 512 × 512) |
| `byte_size` | INTEGER NOT NULL | |
| `updated_at` | INTEGER NOT NULL | epoch millis; the `avatarAt` of the account's `User`, and the `?v=` that tells cached copies apart |

### `friends`, `friend_groups` and `friend_group_members`

The people an account keeps at hand for sharing, and named groups of them. All three are the
account's own — like labels, and unlike anything about a note: the friend is not asked, has no row
back, and nobody else ever reads them. A friend grants nothing; sharing still goes through
`note_shares`, one share at a time.

| `friends` column | Type | Notes |
| --- | --- | --- |
| `owner_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `friend_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE; never the owner |
| `created_at` | INTEGER NOT NULL | the order friends are listed in |

PRIMARY KEY `(owner_id, friend_id)`.

| `friend_groups` column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `owner_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `name` | TEXT NOT NULL | trimmed, 1..50 chars, UNIQUE per owner `NOCASE` |
| `created_at` | INTEGER NOT NULL | |

| `friend_group_members` column | Type | Notes |
| --- | --- | --- |
| `group_id` | INTEGER NOT NULL | FK `friend_groups(id)` ON DELETE CASCADE |
| `user_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE; always one of the group owner's friends |
| `added_at` | INTEGER NOT NULL | the order members are listed in |

PRIMARY KEY `(group_id, user_id)`. Removing a friend removes them from every one of the owner's groups
in the same transaction (`FriendRepository.removeFriend`), so a group never holds somebody who is not a
friend; a deleted account leaves every list through the cascades.

### `server_settings`

| Column | Type | Notes |
| --- | --- | --- |
| `key` | TEXT PK | `registration_open` (`true`/`false`), `default_theme` (a theme id) |
| `value` | TEXT NOT NULL | |

A key that was never written has its default: sign-up **closed**, the built-in theme.

### `password_resets`

| Column | Type | Notes |
| --- | --- | --- |
| `token_hash` | TEXT PK | SHA-256 of the token in the e-mailed link; the token itself is never stored |
| `user_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE; one live reset per account |
| `created_at` | INTEGER NOT NULL | |
| `expires_at` | INTEGER NOT NULL | 24 hours after it was issued |

### `themes` and `theme_files`

The background themes the administrator uploaded. `themes` keeps the id, name, author, licence and
the checked `theme.json` (as the server re-serialized it); `theme_files` (`theme_id` FK ON DELETE
CASCADE, `name`, `content_type`, `data` BLOB, `UNIQUE (theme_id, name)`) keeps the pictures, so the
database file stays the whole state.

### `sessions`

| Column | Type | Notes |
| --- | --- | --- |
| `token` | TEXT PK | 256-bit URL-safe random string, this is the cookie value |
| `user_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `created_at` | INTEGER NOT NULL | |
| `expires_at` | INTEGER NOT NULL | sliding, refreshed on use |
| `last_seen_at` | INTEGER NOT NULL | |

### `notes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `owner_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `kind` | TEXT NOT NULL | `TEXT` or `LIST` |
| `title` | TEXT NOT NULL DEFAULT '' | plain text, no inline styles |
| `content` | TEXT NOT NULL | serialized `NoteDocument` JSON |
| `archived` | INTEGER NOT NULL DEFAULT 0 | 0/1 |
| `trashed_at` | INTEGER NULL | epoch millis, NULL when not in trash |
| `color` | TEXT NOT NULL DEFAULT 'default' | one of the 11 color ids, or `default` |
| `background` | TEXT NULL | one of the 6 background ids, or NULL |
| `reminder_at` | INTEGER NULL | when the reminder fires, in epoch milliseconds |
| `reminder_repeat` | TEXT NULL | `daily`, `weekly`, `monthly`, `yearly`, or NULL for one that does not come back |
| `version` | INTEGER NOT NULL DEFAULT 1 | bumped on every accepted write; the optimistic-concurrency token |
| `created_at` | INTEGER NOT NULL | |
| `updated_at` | INTEGER NOT NULL | |
| `edited_by` | INTEGER NULL | FK `users(id)` ON DELETE SET NULL; who last wrote the content (title, kind, body), the owner at creation |
| `edited_at` | INTEGER NOT NULL | when they did; appearance, metadata, pictures and moves leave both alone |

`title` is denormalized out of `content` because the card grid, sorting and (future) search all
need it without parsing JSON.

### Appearance lives on the note

The reminder is metadata of the note like the archive flag: everyone with access sees the same one,
it is never version-guarded and it never creates a history entry. Colour, background and the reminder
are columns of `notes`, not a `(note, user)` pair. Everyone with access —
owner, `VIEW`, `EDIT` — sees the same values, and anyone who can edit changes them for everyone.

This is **deliberately different from Google Keep**, where colour is personal and a collaborator's
choice never changes what the owner sees. Keeping one appearance on the note is also what makes the
model smaller: there is no resolution step and no row to create lazily on first read.

### `note_pins`

| Column | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `user_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `pinned` | INTEGER NOT NULL | whether this account has the note pinned |
| `position` | INTEGER NOT NULL | where this account has the note since it last pinned or unpinned it |
| PRIMARY KEY | (`note_id`, `user_id`) | |

**A pin is the reader's own**, as in Google Keep: a row says how this account filed this note. A pinned
note leads that account's views and nobody else's, and pinning or unpinning takes it to the top of its
section **for that account alone** — everyone else keeps the note's shared `position`, its version and
its `updated_at`. Anyone who can see the note may pin it, a `VIEW` collaborator too. Taking a share
away takes that account's row with it. Dragging a note sets the shared `position` and the mover's own.

### `note_folds`

| Column | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `user_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| PRIMARY KEY | (`note_id`, `user_id`) | |

**A list's folded "N completed items" are the reader's own**, like a pin: a row means this account
folded the section away, no row means it is open. The card and the editor show the same fold, and it
survives closing the note and a reload. Google Keep keeps it on the note (`is_graveyard_closed` in its
Android app's database, synced between devices) and so folds a shared list for every collaborator at
once; the owner overruled that — a fold is how one person looks at a list, not a change to it. Anyone
who can see the note may fold it, a `VIEW` collaborator too; it never moves the version, `updated_at`
or the history, and nobody else is notified. Taking a share away takes that account's row with it.

### `note_reads`

| Column | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `user_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `seen_at` | INTEGER NOT NULL | the note's `edited_at` when this account last opened it |
| PRIMARY KEY | (`note_id`, `user_id`) | |

**What a reader last saw of a note**, for Google Keep's "edited by" marker on a card: a note is marked
for an account while its `edited_by` is somebody else and its `edited_at` is newer than that account's
`seen_at` — or the account has no row, never having opened the note since it was shared with them.
Opening the note (`POST /api/notes/{id}/seen`) writes the row, so the marker goes away for that reader
alone and comes back with the next edit by anyone else. The reader's own edits never mark a note,
because they make the reader its `edited_by`. Like a pin it is the reader's own business: writing it
moves no version and tells nobody.

### `note_shares`

| Column | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `user_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `permission` | TEXT NOT NULL | `VIEW` or `EDIT` |
| `created_at` | INTEGER NOT NULL | |
| PRIMARY KEY | (`note_id`, `user_id`) | |

The owner must never have a row here; that is enforced in the service layer with `require(...)`.

### `note_versions`

One row per content-changing write, holding the state that write replaced. `UNIQUE (note_id, version)`
keeps the numbering honest, and `ON DELETE CASCADE` means trashing and the 30-day purge need no extra
work. At most 50 snapshots per note are kept; older ones are trimmed on write.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `version` | INTEGER NOT NULL | the version the archived state had |
| `kind` | TEXT NOT NULL | `TEXT` or `LIST` |
| `title` | TEXT NOT NULL | |
| `content` | TEXT NOT NULL | serialized `NoteDocument` |
| `author_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE — who made the edit that replaced it |
| `created_at` | INTEGER NOT NULL | |

Appearance is not versioned. Recolouring a note is not a historic event, and storing it would fill the
history with noise.

### `note_steps` and `note_step_heads`

The body's collaboration log (`docs/COLLABORATION.md`): the ProseMirror steps that brought a note's body
to where it is, numbered by the body version each one produces. The server keeps them as text and never
reads them; it orders them, and an editor that is behind reads the ones it missed.

| Column (`note_steps`) | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `doc_version` | INTEGER NOT NULL | the body version after this step; PK with `note_id` |
| `client_id` | TEXT NOT NULL | the editor that sent it |
| `step` | TEXT NOT NULL | ProseMirror's own step JSON |

| Column (`note_step_heads`) | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER PK | FK `notes(id)` ON DELETE CASCADE; a note without a row is at version 0 |
| `doc_version` | INTEGER NOT NULL | the version the body is at |
| `log_start` | INTEGER NOT NULL | the oldest version the log can bring an editor up from |

The newest 1000 steps of a note are kept. A body written as a whole (`PATCH` with `content`) is not a
step: it moves `doc_version` on by one and starts the log there. Steps and the body they produce are
written in one transaction, so the two never disagree. They are tables of their own, not columns of
`notes`, because the body's version is the log's business.

### `labels`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `owner_id` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| `name` | TEXT NOT NULL | trimmed, 1..50 chars, UNIQUE per owner |
| `created_at` | INTEGER NOT NULL | |

### `note_images`

A note's pictures, bytes included, so that the database file is still the whole state.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | the order of a note's pictures |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `content_type` | TEXT NOT NULL | `image/png`, `image/jpeg`, `image/gif` or `image/webp`, recognised from the bytes |
| `width`, `height` | INTEGER NOT NULL | read from the picture's header |
| `byte_size` | INTEGER NOT NULL | what counts against the owner's storage |
| `data` | BLOB NOT NULL | the picture as uploaded |
| `created_at` | INTEGER NOT NULL | |

### `link_previews`

The card a link turns into, cached by the address it belongs to rather than by the note that uses it.

| Column | Type | Notes |
| --- | --- | --- |
| `url` | TEXT | PRIMARY KEY, the absolute address |
| `title` | TEXT | `og:title`, or the page's `<title>` |
| `site_name` | TEXT | `og:site_name`, or the host without `www.` |
| `image_url` | TEXT NULL | `og:image`, resolved against the page |
| `fetched_at` | INTEGER | epoch millis; the row is refetched once it is a week old |

Nothing here is written by a client, and nothing here is a source of truth: the note's own document
holds its links, and a preview is a cache of what the site said about them.

### `note_labels`

Labels are **per user**: sharing a note does not share your labels. Each row records who attached it,
so a note read by user X returns only the labels X attached (or that X owns). `GET /api/notes?labelId=`
narrows a view to the notes carrying one label; because a label belongs to one account, that can only
ever narrow what the caller was already allowed to see.

| Column | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER NOT NULL | FK `notes(id)` ON DELETE CASCADE |
| `label_id` | INTEGER NOT NULL | FK `labels(id)` ON DELETE CASCADE |
| `added_by` | INTEGER NOT NULL | FK `users(id)` ON DELETE CASCADE |
| PRIMARY KEY | (`note_id`, `label_id`) | |

---

## `NoteDocument` — the internal content format

Content is **never** stored as HTML. It is a JSON document of typed blocks. Each block maps 1:1 to a
line the user sees, and each block type maps 1:1 to a Markdown construct, which is what makes the
future "export to Markdown" feature a pure function.

```jsonc
{
  "version": 1,
  "blocks": [
    {
      "id": "b1",                       // stable, client generated, unique within the note
      "type": "paragraph",              // see block types below
      "checked": false,                 // only meaningful for type == "checklist"; a ticked row keeps its place
      "depth": 0,                       // only meaningful for list types; 0 is the top level
      "spans": [
        { "text": "Groceries " },
        { "text": "today", "bold": true, "italic": true }
      ]
    }
  ]
}
```

### Block types

| `type` | Markdown export | Notes |
| --- | --- | --- |
| `paragraph` | plain line | |
| `heading1` | `# text` | |
| `heading2` | `## text` | |
| `heading3` | `### text` | |
| `bulleted` | `- text` | |
| `numbered` | `1. text` | numbering is regenerated on export |
| `checklist` | `- [ ] text` / `- [x] text` | uses the `checked` flag |

### Nesting

A list line may be indented under the line above it: `depth` counts the levels, `0` being the top
one, and the export indents by four spaces per level. Only `bulleted`, `numbered` and `checklist`
carry it — the server rejects an indented `paragraph` or heading, and anything deeper than
`NoteDocument.MAX_BLOCK_DEPTH` (5), because a line indented further is no longer readable. Tab
indents the line the caret is on and Shift+Tab pulls it back out.

### Span fields

All flags are optional and default to `false`/absent.

| Field | Markdown export |
| --- | --- |
| `text` | the literal text, with Markdown control characters escaped |
| `bold` | `**text**` |
| `italic` | `*text*` |
| `strikethrough` | `~~text~~` |
| `code` | `` `text` `` |
| `underline` | `<u>text</u>` (Markdown has no underline) |
| `link` | `[text](href)` |

### List notes

A `LIST` note stores its items as `checklist` blocks. `kind` is persisted separately because the UI
needs to know which editor affordances to show before the document has any blocks. Within one list,
ticked rows follow the unticked ones: that is the order Google Keep shows, and the editor moves a row
when it is ticked rather than re-sorting it on the way to the screen (`AGENTS.md`, rule 21).

### Invariants

- `pinned` is the **reader's**, not the note's (`note_pins`): it never appears in `content`, and it is
  worked out for the account that reads the note. So is `completedCollapsed` (`note_folds`).
- `position` orders a section, highest first: one above every note there is for a new note, a copy,
  and a note whose pin changes; nothing else moves it, so writing in a note leaves it in place (the
  original's order, measured: an edited note keeps its place, also after a reload).
- `blocks` is never `null`; an empty note is `{"version":1,"blocks":[{"id":"b1","type":"paragraph","spans":[]}]}`.
- Block `id`s are unique within a document but have no meaning outside it.
- The server validates the document shape on write (known block types, `depth` within range and
  only on list types, spans are non-null lists, `text` present) but does **not** sanitize styling, because styling is only ever rendered as
  text nodes plus a fixed set of CSS classes — never as raw HTML.
