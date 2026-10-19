# HTTP API Contract

Base path: `/api`. All requests and responses are `application/json; charset=UTF-8` unless noted.
All timestamps are **epoch milliseconds** (JSON numbers).

Authentication uses an opaque session token stored in an `HttpOnly` cookie named `notka_session`.
The frontend never reads the cookie; it sends `credentials: 'same-origin'` and relies on
the browser. The server stores only a SHA-256 of the token, and changing the password signs out
every other session.

Every response carries a strict `Content-Security-Policy` (scripts from this origin only, no
framing). A `POST`, `PATCH` or `DELETE` whose `Sec-Fetch-Site` is anything but `same-origin` or
`none` is refused with `403 request.cross_site`; a client that sends no `Sec-Fetch-Site` (not a
browser) is unaffected. `POST /api/auth/login`, `/register` and `/password-reset` are limited to 10 attempts a minute
per client address (`429 request.too_many`). A request body larger than twice
`NOTKA_MAX_NOTE_BYTES` plus 64 KiB is refused with `413 request.too_large` (a picture's upload may
be 10 MB, a theme's 30 MB).

## Error format

Every non-2xx response has this body:

```json
{
  "error": {
    "code": "CONFLICT",
    "key": "share.already_shared",
    "message": "This note is already shared with bob@example.com",
    "params": { "email": "bob@example.com" }
  }
}
```

| Field | Notes |
| --- | --- |
| `code` | Stable, coarse class of the failure; matches the table below. |
| `key` | Stable, machine-readable identifier the frontend localizes. Always present. |
| `message` | English developer-facing fallback. The backend never translates. |
| `params` | Optional plain-string values filling the placeholders of `key`; omitted when empty. |

| `code` | HTTP status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Body or query parameter failed validation |
| `UNAUTHORIZED` | 401 | Missing, invalid or expired session |
| `FORBIDDEN` | 403 | Authenticated but not allowed to perform this action |
| `NOT_FOUND` | 404 | Resource does not exist **or** the caller cannot see it |
| `CONFLICT` | 409 | Unique constraint violation (email already registered, duplicate label, …) |
| `PAYLOAD_TOO_LARGE` | 413 | Note content, or the request body itself, exceeds the configured limit |
| `TOO_MANY_REQUESTS` | 429 | Too many sign-in or registration attempts from one address; `Retry-After` says when to try again |
| `INTERNAL_ERROR` | 500 | Unexpected failure; details are logged, never returned |

### Error keys

| `key` | Typical `params` |
| --- | --- |
| `request.invalid_body`, `request.unauthorized`, `request.not_found`, `request.internal` | – |
| `request.too_large`, `request.too_many`, `request.cross_site` | – |
| `auth.invalid_credentials`, `auth.username_invalid`, `auth.admin_required`, `auth.reset_invalid` | – |
| `auth.email_taken`, `auth.email_invalid` | `email` |
| `auth.registration_disabled`, `auth.display_name_invalid`, `auth.password_too_short`, `auth.invalid_current_password` | – |
| `note.not_found`, `note.forbidden` | `noteId` |
| `note.content_too_large` | `limit` |
| `note.invalid_document` | – |
| `note.steps_behind` (`409`) | `noteId` — somebody else's steps came first; read them and send again |
| `share.recipient_not_found`, `share.already_shared`, `share.cannot_share_with_self` | `email` |
| `share.not_owner`, `share.not_found` | `noteId`, `userId` |
| `label.not_found` | `labelId` |
| `label.name_taken` | `label` |
| `label.name_invalid` | – |
| `note.limit_reached`, `label.limit_reached` (`403`) | `limit` |
| `admin.user_not_found`, `admin.cannot_change_admin`, `admin.user_has_no_email` | – |
| `mail.not_configured` (`409`), `mail.send_failed` (`503`) | – |
| `theme.not_found`, `theme.archive`, `theme.too_large`, `theme.manifest`, `theme.name`, `theme.empty` | `detail` where it names something |
| `theme.format`, `theme.unknown_background`, `theme.missing_file`, `theme.file_type`, `theme.tint` | `detail`: the value or file at fault |

---

## Shared JSON shapes

### `User`

```json
{ "id": 1, "email": "ada@example.com", "username": null, "displayName": "Ada Lovelace", "admin": false }
```

Every account that signed up has an `email` and no `username`. The administrator created from the
environment has a `username` it signs in with, and an `email` only when `NOTKA_ADMIN_EMAIL` gave it
one. `admin` is `true` for the instance's administrator alone.

### `Label`

```json
{ "id": 7, "name": "work" }
```

### `Note`

```json
{
  "id": 42,
  "kind": "TEXT",
  "title": "Groceries",
  "content": { "version": 1, "blocks": [{ "id": "b1", "type": "paragraph", "spans": [] }] },
  "color": "yellow",
  "background": null,
  "archived": false,
  "pinned": false,
  "position": 42,
  "trashedAt": null,
  "createdAt": 1767225600000,
  "updatedAt": 1767225600000,
  "version": 7,
  "docVersion": 31,
  "owner": { "id": 1, "email": "ada@example.com", "displayName": "Ada Lovelace" },
  "access": "OWNER",
  "canEdit": true,
  "canChangeAppearance": true,
  "labels": [ { "id": 7, "name": "work" } ],
  "shares": [ { "user": { "id": 2, "email": "bob@example.com", "displayName": "Bob" }, "permission": "EDIT" } ]
}
```

| Field | Notes |
| --- | --- |
| `kind` | `TEXT` or `LIST` |
| `color` | the note's colour; `"default"` when unset. Everyone with access sees this same value |
| `background` | the note's background pattern, or `null`. Everyone with access sees this same value |
| `reminderAt` | epoch milliseconds of the reminder, omitted when the note has none |
| `reminderRepeat` | `daily`, `weekly`, `monthly` or `yearly`, omitted when the reminder does not come back |
| `version` | bumped by every accepted write; the live channel announces it |
| `docVersion` | the body's version in its step log — how many ProseMirror steps brought it here (see below) |
| `access` | `OWNER`, `VIEW` or `EDIT` for the requesting user |
| `canEdit` | `true` for `OWNER` and `EDIT` |
| `canChangeAppearance` | `true` for `OWNER` and `EDIT`, `false` for `VIEW`. A change applies to everyone |
| `labels` | only the requesting user's own labels |
| `shares` | everyone the note is shared with (the owner is `owner`, never a share); omitted while there is nobody |

---

## Authentication

### `POST /api/auth/register`

Request:

```json
{ "email": "ada@example.com", "displayName": "Ada Lovelace", "password": "correct horse battery" }
```

Validation: `email` must match a basic address shape and be ≤ 254 chars; `displayName` 1..80 chars;
`password` 8..200 chars. Email is lowercased and trimmed before uniqueness checks.

Response `201`:

```json
{ "user": { "id": 1, "email": "ada@example.com", "displayName": "Ada Lovelace" } }
```

Also sets the session cookie. `409 CONFLICT` when the email is taken.

`403 auth.registration_disabled` while the administrator keeps sign-up closed — which is how every
instance starts.

### `POST /api/auth/login`

Request: `{ "login": "...", "password": "..." }` — `login` is an e-mail address, or the
administrator's username (anything without an `@`, compared without case).

Response `200`: `{ "user": { ... } }` plus a fresh session cookie.
`401 auth.invalid_credentials` on failure (never reveal which part was wrong).

### `POST /api/auth/password-reset`

Request: `{ "token": "...", "password": "new secret" }`. The token is the part after `#` of the link
an administrator's reset e-mailed (`<NOTKA_PUBLIC_URL>/reset-password#<token>`); it lives in the
fragment so no server or proxy on the way ever logs it.

Response `200`: `{ "user": { ... } }` plus a fresh session cookie — the reset signs the account in.
The link works once, for 24 hours; otherwise `400 auth.reset_invalid`.

### `POST /api/auth/logout`

Response `204`. Deletes the session row and clears the cookie. Idempotent.

### `POST /api/auth/logout-all`

Response `204`. Ends **every** session of the account, the calling one included, and clears the
cookie. `401` without a session.

### `GET /api/auth/me`

Response `200`: `{ "user": { ... } }`, or `401 UNAUTHORIZED` when there is no valid session.

### `PATCH /api/auth/me`

Request (all fields optional, at least one required):

```json
{ "displayName": "Ada L.", "currentPassword": "old", "newPassword": "new secret" }
```

Changing the password requires `currentPassword`. Response `200`: `{ "user": { ... } }`.
A new password signs out every other session of the account; the one making the change stays.

---

## Notes

### `GET /api/notes`

Query parameters:

| Name | Values | Default | Notes |
| --- | --- | --- | --- |
| `view` | `active`, `archived`, `trash` | `active` | `active` excludes archived and trashed notes |
| `labelId` | integer | – | only notes carrying that label; a label the caller does not own is `404 label.not_found` |
| `reminders` | `true` | – | the **reminders view**: the notes carrying a reminder, soonest first. Its order is by the reminder, not by when the note was last written, so it is its own view rather than another `view`; `view` and `labelId` are ignored with it |

Response `200`: `{ "notes": [ Note, ... ] }`, sorted by `pinned` first and then `position`
descending, so a pinned note leads every view. `position` is Google Keep's own order: a new note, a
copy, and a note that is pinned or unpinned go to the top of their section; writing in a note does
not move it. Only notes owned by or shared with the requesting
user are ever returned.

### `POST /api/notes`

Request (all fields optional):

```json
{
  "kind": "TEXT",
  "title": "",
  "content": { "version": 1, "blocks": [{ "id": "b1", "type": "paragraph", "spans": [] }] },
  "labels": [7]
}
```

Omitting `content` creates the canonical empty note (one empty paragraph). An explicit `blocks: []`
is rejected with `400 note.invalid_document` — a document always has at least one block.

Response `201`: the created `Note`. `color` defaults to `"default"`, `background` to `null`.

### `GET /api/notes/{id}`

Response `200`: the `Note`. `404 NOT_FOUND` when it does not exist or the caller has no access.

### `PATCH /api/notes/{id}`

Partial update — only the fields present are applied. Requires `canEdit`.

```json
{
  "kind": "LIST",
  "title": "Groceries",
  "content": { "version": 1, "blocks": [{ "id": "b1", "type": "paragraph", "spans": [] }] },
  "archived": true,
  "pinned": true,
  "trashed": false,
  "color": "teal",
  "background": "groceries",
  "labels": [7, 9]
}
```

| Field | Notes |
| --- | --- |
| `kind` | switching kind does not rewrite `content` |
| `content` | the body **as a whole**, guarded by `version`. Editors write the body as steps instead (`POST /api/notes/{id}/steps`); a whole body moves `docVersion` on by one and starts the step log again |
| `trashed` | `true` sets `trashed_at = now`, `false` restores the note; `archived` is untouched |
| `pinned` | metadata like `archived`: never version-guarded, never archived into the history, and visible to everyone with access |
| `color` | must be one of the 11 color ids or `default`; stored on the note, so it changes for everyone |
| `background` | one of the 9 background ids, or `""` to clear (`null`/omitted leaves it alone); likewise shared |
| `reminderAt` | epoch milliseconds; **`0` takes the reminder away**, `null`/omitted leaves it alone |
| `reminderRepeat` | `daily`, `weekly`, `monthly`, `yearly`, or omitted for one that does not come back; part of the same instruction as `reminderAt` |
| `labels` | replaces the caller's label set for this note; label ids must belong to the caller |
| `updatedAt` | always bumped, even for appearance-only changes |

Response `200`: the updated `Note`.

### `POST /api/notes/{id}/steps`

How an editor writes the body (`docs/COLLABORATION.md`): its ProseMirror steps over the body version
it has, and what they produce. Requires `canEdit`. The server never reads a step — it numbers them,
keeps the newest 1000, and stores the body that came with them.

```json
{
  "docVersion": 31,
  "clientId": "6f1c…",
  "steps": [ { "stepType": "replace", "from": 7, "to": 7, "slice": { "content": [ { "type": "text", "text": "x" } ] } } ],
  "content": { "version": 1, "blocks": [ … ] },
  "title": "Groceries",
  "kind": "LIST"
}
```

| Field | Notes |
| --- | --- |
| `docVersion` | the body version the steps were made against; it must be the current one |
| `clientId` | the editor's own name, 1–64 characters; its steps come back with it, which is how an editor recognises its own |
| `steps` | at most 2000; may be empty when only the title or kind changed |
| `content` | the body the steps produce, validated like any `NoteDocument` |
| `title`, `kind` | optional; written with the body — send them only when they changed |
| `titleBase` | optional, with `title`: the title it replaces as the writer last saw it. A write queued offline sends it, and is refused with `409 note.version_conflict` when the note was renamed meanwhile |

Response `200`: the `Note`, at `docVersion + steps.length`. `409 note.steps_behind` when the body is
past `docVersion`: read the steps you are missing, take them in (your own are rebased over them) and
send again. Like a content `PATCH`, an accepted write archives the state it replaced.

### `GET /api/notes/{id}/steps?since={docVersion}`

The steps after `since`, oldest first, for anyone who can see the note:

```json
{ "docVersion": 33, "steps": [ { "step": { … }, "clientId": "6f1c…" }, { "step": { … }, "clientId": "a07e…" } ], "reset": false }
```

`reset: true` (and no steps) when the log does not reach back to `since` — it was trimmed, or the body
was written as a whole by a `PATCH` with `content`, which starts the log again. The editor then reads
the note and lays what it typed over the server's body.

### `POST /api/notes/{id}/move`

Puts a note in the order its views show — what dragging its card does. Requires `canEdit`.

```json
{ "before": 17 }
```

Exactly one of `before` (directly above that note) and `after` (directly below it), a note the
caller can see. The note takes the place, and every note at that place or above moves up by one, which
keeps everyone's order among themselves as it was. The note's `version` moves on and its collaborators
are told; `updatedAt` does not, because being moved is not being edited. Response `200`: the `Note`.
`400 request.invalid_body` without exactly one anchor, or with the note itself as the anchor.

### `POST /api/notes/{id}/images`

Attaches a picture. The body **is** the picture (any `Content-Type`); the server recognises PNG, JPEG,
GIF and WebP from the bytes and reads their size from the header. Requires edit access. Response
`201` with the updated `Note`, whose `images` lists `{ "id", "width", "height", "contentType" }` in the
order they were added, and whose `version` has moved on (collaborators are notified).

| Failure | Status / key |
| --- | --- |
| not a picture we accept (SVG included) | `400 image.unsupported` |
| over 10 MB | `413 image.too_large` (`limit` in MB) |
| 20 pictures already | `403 image.limit_reached` (`limit`) |
| the owner's picture storage is full | `403 image.storage_full` |
| view-only collaborator | `403 note.forbidden` |

### `GET /api/notes/{id}/images/{imageId}`

The picture's bytes with its type, `Cache-Control: private, max-age=31536000, immutable`. Anyone who
can see the note. An id that belongs to another note is `404 image.not_found`.

### `DELETE /api/notes/{id}/images/{imageId}`

Requires edit access. Response `200` with the updated `Note`.

### `POST /api/notes/{id}/copy`

Creates a copy owned by the caller (title keeps its text, shares are not copied, labels are copied).
Response `201`: the new `Note`.

### `DELETE /api/notes/{id}`

Moves the note to the trash (sets `trashed_at`). Response `200`: the updated `Note`.
`DELETE /api/notes/{id}?permanent=true` deletes the row and returns `204`. Only the owner may
permanently delete; collaborators may trash a shared note out of their own view —
for now, trashing a shared note trashes it for everyone and requires `canEdit`.

### `POST /api/notes/{id}/restore`

Clears `trashed_at`. Response `200`: the `Note`.

## Version history

Every write that changes `title`, `kind` or `content` archives the state it replaced. Appearance is
not versioned: colour belongs to the note, not to a moment in its history. A note keeps its 50 newest
snapshots; older ones are dropped. The rows cascade away with the note.

### `GET /api/notes/{id}/versions`

Readable by anyone who can see the note, `VIEW` collaborators included. Response `200`:

```json
{ "versions": [ { "version": 3, "kind": "TEXT", "title": "Kraków", "createdAt": 1767225600000,
                  "author": { "id": 1, "email": "ada@example.com", "displayName": "Ada Lovelace" } } ] }
```

Newest first. The list deliberately carries **no** `content`: a note can keep fifty snapshots, and
shipping every body would turn a list request into megabytes.

### `GET /api/notes/{id}/versions/{version}`

The same entry with `content` included, which is what the client downloads. `404` with
`key = note.version_not_found` when the note has no such snapshot.

### `DELETE /api/notes/{id}/labels/{labelId}`

Removes one label from the note for the calling user. Response `200`: the updated `Note`.

---

## Sharing

The original's rule: everyone with access sees the collaborators, and everyone who can edit
(`OWNER`, `EDIT`) adds, changes and removes them — a `VIEW` collaborator gets `403 note.forbidden`.
The owner is not a share, so nobody can remove the owner.

### `GET /api/notes/{id}/shares`

Anyone with access. Response `200`:

```json
{ "shares": [ { "user": { "id": 2, "email": "bob@example.com", "displayName": "Bob" }, "permission": "EDIT" } ] }
```

### `POST /api/notes/{id}/shares`

Anyone who can edit.

```json
{ "email": "bob@example.com", "permission": "EDIT" }
```

`permission` is `VIEW` or `EDIT`. Response `201`: the created share.
Errors: `404 NOT_FOUND` when no account has that email (the API deliberately does not enumerate
users), `400 VALIDATION_ERROR` when sharing with yourself, `409 CONFLICT` when that account
already has the note — its owner included (use `PATCH` to change the permission).

### `PATCH /api/notes/{id}/shares/{userId}`

Anyone who can edit. `{ "permission": "VIEW" }` → `200` with the updated share.

### `DELETE /api/notes/{id}/shares/{userId}`

Anyone who can edit. Response `204`. The note's appearance is untouched: it belongs to the note, not to the
collaborator being removed.

---

## Labels

Labels are per user and are never shared.

### `GET /api/labels`

Response `200`: `{ "labels": [ Label, ... ] }`, sorted by name (`NOCASE`).

### `POST /api/labels`

`{ "name": "work" }` → `201` with the `Label`. `409 CONFLICT` when the name already exists for the
caller (case-insensitive).

### `PATCH /api/labels/{id}`

`{ "name": "work/2026" }` → `200`. Renaming to an existing name is a `409`.

### `DELETE /api/labels/{id}`

Response `204`. Detaches the label from all notes.

---

## Misc

### `GET /api/health`

Response `200`:

```json
{
  "status": "ok",
  "version": "1.0.0-rc1",
  "demo": false,
  "registrationOpen": true,
  "trashRetentionDays": 30,
  "demoAccounts": []
}
```

`registrationOpen` says whether `POST /api/auth/register` would accept a sign-up right now — the
administrator's switch in the server settings, `false` until they open it; the sign-in screen hides
its "Create an account" link otherwise. `trashRetentionDays` is
`NOTKA_TRASH_RETENTION_DAYS`, which the trash states.

No authentication required. `demoAccounts` lists the sample sign-ins a demo instance offers, and is
always empty unless the server was started with `DEMO=true`; it exists so the sign-in screen can
show them without a second copy of the credentials in the frontend.

---

## Background themes

Themes are uploaded by the administrator and chosen by every account for itself
(`docs/THEMES.md`). The built-in theme, `notka`, is not in the list: its pictures ship with the app.

### `GET /api/themes`

Response `200`:

```json
{
  "themes": [
    {
      "id": "watercolour",
      "name": "Watercolour",
      "author": "Ada",
      "license": "CC0",
      "backgrounds": {
        "food": { "light": "/api/themes/watercolour/files/3", "dark": "/api/themes/watercolour/files/3", "tint": "#fbe4d8", "tintDark": null }
      }
    }
  ],
  "defaultThemeId": "notka",
  "selectedThemeId": null
}
```

`selectedThemeId` is the account's own pick; `null` follows `defaultThemeId`.

### `PUT /api/themes/selection`

Request: `{ "themeId": "watercolour" }`, or `null` to follow the default. Response `200`: the same
body as `GET /api/themes`. `404 theme.not_found` for a theme that does not exist.

### `GET /api/themes/{themeId}/files/{fileId}`

The picture's bytes, `Cache-Control: private, max-age=31536000, immutable` (a replaced theme gets new
file ids), and a `Content-Security-Policy` with `sandbox`, so an SVG opened on its own runs nothing.

---

## Server settings

Every route here answers `403 auth.admin_required` to anybody but the administrator.

### `GET /api/admin/settings`

Response `200`: `{ "registrationOpen": false, "defaultThemeId": "notka", "mailConfigured": true }`.
`mailConfigured` is whether a reset can be e-mailed: `NOTKA_SMTP_HOST` and `NOTKA_PUBLIC_URL` are set.

### `PATCH /api/admin/settings`

Request (fields optional): `{ "registrationOpen": true, "defaultThemeId": "watercolour" }`.
Response `200`: the settings as above.

### `GET /api/admin/users`

Response `200`:

```json
{
  "accounts": [
    {
      "user": { "id": 2, "email": "ada@example.com", "username": null, "displayName": "Ada", "admin": false },
      "createdAt": 1700000000000,
      "lastSeenAt": 1700000500000,
      "notes": 12,
      "noteBytes": 20480,
      "historyBytes": 4096,
      "imageBytes": 1048576,
      "totalBytes": 1073152
    }
  ],
  "imageQuotaBytes": 1073741824,
  "databaseBytes": 5242880
}
```

Sizes are bytes of what each account **owns**: its notes' titles and documents (trash included),
their version history and their pictures. `databaseBytes` is the database file itself.

### `DELETE /api/admin/users/{id}`

Response `204`. Removes the account with every note, picture and label it owns; notes it was only
given access to stay with their owners. The administrator's own account is `403
admin.cannot_change_admin`.

### `POST /api/admin/users/{id}/password-reset`

Response `204`. E-mails the account a link to choose a new password (valid 24 hours, once), and
only once the mail server has accepted it voids the old password and signs every device out. The
e-mail is written in the language of the administrator's `Accept-Language` (`pl`, or English).
`409 mail.not_configured`, `409 admin.user_has_no_email`, `503 mail.send_failed` — in every failure
the account stays as it was.

### `POST /api/admin/themes`

The body is the theme's `.zip` (any `Content-Type`). Response `201`: the theme as in
`GET /api/themes`. An upload with the id of an existing theme replaces it. Refused with a
`theme.*` key that says why — see `docs/THEMES.md` for the rules.

### `DELETE /api/admin/themes/{themeId}`

Response `204`. Accounts that picked it, and the default if it was the default, go back to the
built-in theme.

---

## Events

### `GET /api/events`

A **Server-Sent Events** stream, one per signed-in user, and the only push channel in the API. A
session is required: an anonymous caller is answered `401`, never an open stream. One account
holds at most 16 streams at once; another is answered `429 request.too_many`.

Each message carries a note id and its new version — **never content**:

```
data: {"type":"note.changed","noteId":42,"version":7}
```

- The client re-reads what it cares about through the ordinary REST endpoints (`GET /api/notes` or
  `GET /api/notes/{id}`) and ignores an event whose version it already has.
- There is no second write path: everything still goes through `POST`/`PATCH`/`DELETE`.
- A client that is typing in the note does **not** have the remote version applied under its hands;
  it marks the note as changed elsewhere and offers a reload, which is the same path as the `409`
  below. See `docs/COLLABORATION.md`.
- A comment line (`: keep-alive`) is sent every **five seconds** so proxies in front of the server do
  not decide the stream is dead (the Vite dev proxy waits ten seconds, nginx sixty).

---

## Constants shared with the frontend

### Colors (11 + default)

`default`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `darkblue`, `purple`, `pink`, `brown`, `gray`

Note: `default` is the plain white/dark card; the 11 named entries are the customizable colors.

### Link previews

A note DTO carries `linkPreviews` — the cards for the links its document holds — omitted entirely
when there are none:

```json
"linkPreviews": [
  { "url": "https://github.com/", "title": "GitHub", "siteName": "GitHub",
    "imageUrl": "https://…/card.png" }
]
```

The addresses are read out of the note's own document; they are never sent by a client. A card is
served from the cache, so a read never waits for a site: the page is fetched in the background when
the note is written — at most five addresses per note, `http`/`https` only, every host (and every
redirect hop) resolved and refused if it points inside the network, with a timeout, a 256 KB body cap
and a named user agent. A page that never answers simply has no card.

### Backgrounds (7)

`groceries`, `food`, `music`, `recipes`, `notes`, `places`, `travel`, `video`, `celebration`

Each id maps to a CSS treatment defined once in `frontend/src/lib/styles/palette.css`.
