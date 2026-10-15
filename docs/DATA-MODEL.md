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
      "checked": false,                 // only meaningful for type == "checklist"
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

- `pinned` is a **note** field, not a document field: it never appears in `content`, so it can
  never invalidate a document. Like `archived`, it is metadata — see `AGENTS.md`.
- `position` orders a section, highest first: one above every note there is for a new note, a copy,
  and a note whose pin changes; nothing else moves it, so writing in a note leaves it in place (the
  original's order, measured: an edited note keeps its place, also after a reload).
- `blocks` is never `null`; an empty note is `{"version":1,"blocks":[{"id":"b1","type":"paragraph","spans":[]}]}`.
- Block `id`s are unique within a document but have no meaning outside it.
- The server validates the document shape on write (known block types, `depth` within range and
  only on list types, spans are non-null lists, `text` present) but does **not** sanitize styling, because styling is only ever rendered as
  text nodes plus a fixed set of CSS classes — never as raw HTML.
