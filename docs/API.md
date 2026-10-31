# HTTP API Contract

Base path: `/api`. All requests and responses are `application/json; charset=UTF-8` unless noted.
All timestamps are **epoch milliseconds** (JSON numbers).

Authentication uses an opaque session token stored in an `HttpOnly` cookie named `notka_session`.
The frontend never reads the cookie; it sends `credentials: 'same-origin'` and relies on
the browser. The server stores only a SHA-256 of the token, and changing the password signs out
every other session.

Every response carries a strict `Content-Security-Policy` (scripts from this origin only, no
framing; `'wasm-unsafe-eval'` lets the page compile the JPEG XL encoder it loads from this origin for
avatars, and allows no `eval` of script). A `POST`, `PUT`, `PATCH` or `DELETE` whose `Sec-Fetch-Site` is anything but `same-origin` or
`none` is refused with `403 request.cross_site`; a client that sends no `Sec-Fetch-Site` (not a
browser) is unaffected. `POST /api/auth/login`, `/register`, `/password-reset`, the `/me/encryption` routes and
`/sso` are limited to 10 attempts a minute per client address (`429 request.too_many`). A request body larger than twice
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
| `auth.recovery_key_required` (`409`), `auth.recovery_key_invalid`, `auth.encryption_already_on` (`409`) | – |
| `auth.encryption_locked` (`403`), `auth.encryption_secret_invalid`, `auth.passphrase_too_short` | – |
| `auth.sso_not_configured` (`404`), `auth.sso_unavailable` (`503`), `auth.sso_failed`, `auth.sso_denied` (`403`), `auth.sso_email_required`, `auth.sso_email_taken` (`409`), `auth.sso_identity_taken` (`409`), `auth.sso_already_linked` (`409`), `auth.sso_password_required` (`409`) | – |
| `admin.user_has_no_password` (`409`) | – |
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
| `avatar.unsupported`, `avatar.not_found` | `userId` for the second |
| `avatar.too_large` (`413`) | `limit` in KB |
| `friend.not_found` | `login` (adding) or `userId` (removing) |
| `friend.self` | – |
| `friend.already_added` (`409`) | `name` |
| `friend.limit_reached`, `friend_group.limit_reached` (`403`) | `limit` |
| `friend_group.not_found` | `groupId` |
| `friend_group.name_invalid` | – |
| `friend_group.name_taken` (`409`) | `name` |
| `friend_group.not_a_friend` | `userId` |
| `admin.user_not_found`, `admin.cannot_change_admin`, `admin.user_has_no_email` | – |
| `mail.not_configured` (`409`), `mail.send_failed` (`503`) | – |
| `theme.not_found`, `theme.archive`, `theme.too_large`, `theme.manifest`, `theme.name`, `theme.empty` | `detail` where it names something |
| `theme.format`, `theme.unknown_background`, `theme.missing_file`, `theme.file_type`, `theme.tint` | `detail`: the value or file at fault |

---

## Shared JSON shapes

### `User`

```json
{ "id": 1, "email": "ada@example.com", "username": null, "displayName": "Ada Lovelace", "admin": false, "avatarAt": 1761390000000 }
```

Every account that signed up has an `email` and no `username`. The administrator created from the
environment has a `username` it signs in with, and an `email` only when `NOTKA_ADMIN_EMAIL` gave it
one. `admin` is `true` for the instance's administrator alone. `avatarAt` is when the account last
changed its own picture, `null` while it has none (the client draws the initials); the picture is at
`GET /api/users/{id}/avatar?v={avatarAt}`.

The signed-in account itself — every `{ "user": … }` the `/api/auth` routes answer with — carries more
fields, which nobody else is told: `encryption` (its private notes are stored encrypted,
`docs/ENCRYPTION.md`), `linkPreviews` (the server fetches cards for the links in its notes; `true` by
default), `encryptionLocked` (this session has not entered the account's secret yet), `hasPassword`
(`false` for an account from the identity provider) and `ssoLinked` (it is connected to the provider).

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
  "completedCollapsed": false,
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
| `completedCollapsed` | whether **the caller** folded the list's "N completed items" away (`note_folds`); the card and the editor both show it |
| `labels` | only the requesting user's own labels |
| `shares` | everyone the note is shared with (the owner is `owner`, never a share); omitted while there is nobody |
| `encryption` | `ENCRYPTED` while the note is stored encrypted with its owner's key; otherwise why not: `SHARED`, `LINK_PREVIEWS` (the server reads its links for their cards) or `DISABLED` (the owner has not turned encryption on). See `docs/ENCRYPTION.md` |
| `unseenEdit` | `{ "user": User, "at": 1767225600000 }`: somebody else wrote the note's content (title, kind or body) at `at` and the caller has not opened the note since — the card's "edited by" marker. Omitted otherwise, and always for the caller's own edits. `POST /api/notes/{id}/seen` takes it away |

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

An account that encrypts its notes also sends `"recoveryKey": "PW7H-F365-…"` (case, dashes and
spaces do not matter): the forgotten password was what opened the notes. Without it the answer is
`409 auth.recovery_key_required`, a key that does not match is `400 auth.recovery_key_invalid`, and
`"discardEncrypted": true` resets anyway, deleting the sealed notes for good.

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
`"linkPreviews": false` stops the server reading the links in the account's notes (no cards, and
notes with links can be encrypted); `true` brings the cards back.

### `POST /api/auth/me/encryption`

Request: `{ "password": "…" }` — asked again, because it is what the account's key is wrapped with. An
account without a password sends `{ "passphrase": "…" }` instead, which it chooses here (8..200 chars,
`400 auth.passphrase_too_short`).
Response `201`: `{ "user": { …, "encryption": true }, "recoveryKey": "PW7H-F365-PDY3-TGEC-HY55-SVMD-MJ35-X3PS" }`
— the only answer that ever carries the recovery key. The account's private notes are sealed before
it is sent, and every other session of the account is signed out. `400 auth.invalid_current_password`,
`409 auth.encryption_already_on`.

### `DELETE /api/auth/me/encryption`

Response `200`: `{ "user": { …, "encryption": false } }`. Every note of the account is stored in the
clear again and the key is forgotten; the recovery key stops working.

### `POST /api/auth/me/encryption/unlock`

Request: `{ "secret": "…" }`, the account's passphrase, or its password when it has one. This session
holds the key from now on. Response `200`: `{ "user": { …, "encryptionLocked": false } }`;
`400 auth.encryption_secret_invalid`.

While a session has not done this, `GET /api/auth/me`, the routes in this section, `POST /api/auth/logout`
and `/logout-all` work, and every other authenticated route answers `403 auth.encryption_locked`.

### `POST /api/auth/me/encryption/recover`

Request: `{ "recoveryKey": "…", "newPassphrase": "…" }`. Opens this session with the recovery key. An
account without a password must set a new passphrase here, and its other sessions are signed out; an
account with one leaves `newPassphrase` out and keeps its password. `400 auth.recovery_key_invalid`.

### `POST /api/auth/me/encryption/discard`

Only for a locked account without a password, `403 auth.encryption_locked` otherwise. The sealed notes
are deleted for good and the account continues without encryption. Response `200`: `{ "user": { … } }`.

### `POST /api/auth/me/encryption/passphrase`

Request: `{ "currentPassphrase": "…", "newPassphrase": "…" }`. The same key under a new passphrase;
every other session is signed out. `400 auth.encryption_secret_invalid`.

### Signing in through an identity provider

OpenID Connect's authorization code flow with PKCE (S256), a `state` and a `nonce`, against the provider
in `NOTKA_OIDC_*` (`docs/ARCHITECTURE.md`). The provider's discovery document says where everything is,
and the ID token is verified against its published keys (signature, `iss`, `aud`, `exp`, `nonce`). The
address to register at the provider is `<NOTKA_PUBLIC_URL>/api/auth/sso/callback`.

- **An account is the provider's `iss` and `sub`**, never its e-mail address.
- **A subject seen for the first time is a sign-up**, under the administrator's switch: while sign-up is
  closed it ends in `auth.registration_disabled`, and a known subject still signs in. The new account
  takes its address and name from the provider once (both are its own to change afterwards) and has no
  password. No address ends in `auth.sso_email_required`. `email_verified` is not required: the address is
  never what links an account, and a password sign-up does not verify its address either.
- **An address another account already has is refused** (`auth.sso_email_taken`), and is never linked. An
  existing account joins from inside, signed in, with `"link": true`.
- **The provider never grants anything.** The administrator stays the account from
  `NOTKA_ADMIN_USERNAME`, whose password sign-in always works, so a provider that is down cannot lock the
  instance out. The administrator may connect that account like any other and stays the administrator.
- **Changing `NOTKA_OIDC_ISSUER` makes every identity a new one**: an account with a password disconnects
  and connects again; one without has no way back in.

#### `POST /api/auth/sso/start`

Request: `{ "link": false }`. `true` connects the signed-in account instead of signing in, and needs a
session. Android's app also sends `"appChallenge"` (see below), and then no cookie is set. Response `200`: `{ "url": "https://id.example.com/authorize?…" }`, where the page sends the
browser next, plus a cookie that holds the attempt for ten minutes: `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Secure` and named `__Host-notka_sso` when `NOTKA_COOKIE_SECURE=true`, so a sibling subdomain cannot plant
one. `404 auth.sso_not_configured`, `503 auth.sso_unavailable`.

#### `GET /api/auth/sso/callback`

Where the provider sends the browser back: `?code=…&state=…` or `?error=…`. It always answers `302`:
to `/` with a session cookie after a sign-in, to `/?sso=linked` after connecting, and to
`/?ssoError=<error key>` on any failure, which the page localizes. A `state` that does not match this
browser's attempt is `auth.sso_failed`. A `state` of an attempt Android's app started goes to the app
instead: `dev.duwe.notka://sso?ssoCode=<code>` or `?ssoError=<error key>`.

#### Android's app

The provider's page opens in a Custom Tab, because a WebView has neither the browser's sign-in at the
provider nor its passkeys, and a Custom Tab's cookies are not the WebView's. So the attempt stays on the
server (in memory, ten minutes), and what binds the answer to the device is a secret of the WebView's,
the way PKCE does it (RFC 8252, 7636):

1. The page makes a random `verifier`, keeps it in `localStorage` and sends its base64url SHA-256 as
   `appChallenge` to `POST /api/auth/sso/start`.
2. The callback, in the Custom Tab, signs nobody in and does not contact the provider. It stands a code in
   for the provider's answer, valid for **one minute and one try**, and redirects to the app's scheme.
3. The app opens `/?ssoCode=<code>` in the WebView, and the page redeems the code with the verifier.

A scheme can be claimed by any app, and the provider's page can be opened from anybody's link, so nothing
happens before step 3: a code without the verifier is worthless, and a `link` attempt connects nothing.
The remaining exposure is a hostile app on the reader's phone **and** a reader who completes a sign-in
started by that app's owner from a link: the same one every app with a custom scheme and PKCE has.

#### `POST /api/auth/sso/exchange`

Request: `{ "code": "…", "verifier": "…" }`. Response `200`: `{ "user": { … }, "linked": false }`, with a
session cookie as after any sign-in; an account with sealed notes then has `encryptionLocked: true`.
`"linked": true` when the attempt connected the signed-in account, which needs that session (`401`
without it). A code that is unknown, used, expired or given the wrong verifier is `400 auth.sso_failed`,
and is used up by that try. Otherwise the failures of signing in or connecting above.

#### `DELETE /api/auth/me/sso`

Disconnects the account. `409 auth.sso_password_required` for an account with no password to sign in
with. Response `200`: `{ "user": { …, "ssoLinked": false } }`.

### `PUT /api/auth/me/avatar`

Sets the account's own picture. The body **is** the picture (any `Content-Type`), and it must be
**JPEG XL** — a bare codestream or the ISO BMFF container, recognised from the bytes, whose size is read
from the codestream's header — at most 1024 pixels a side and 512 KB. The web client crops the picture
the reader chose, scales it to 512 × 512 and encodes it in the page (libjxl as WebAssembly,
`frontend/src/boundary/jpegXl.ts`), so the server converts nothing and needs no native encoder.
Response `200`: `{ "user": { ... } }` with the new `avatarAt`.

| Failure | Status / key |
| --- | --- |
| not JPEG XL (PNG, JPEG, SVG …), or wider or taller than 1024 | `400 avatar.unsupported` |
| over 512 KB | `413 avatar.too_large` (`limit` in KB) |

### `DELETE /api/auth/me/avatar`

Takes the picture away; the initials come back. Response `200`: `{ "user": { ... } }` with
`avatarAt: null`. Harmless when there is none.

### `GET /api/users/{id}/avatar`

The account's picture as `image/jxl`, to anyone signed in — it is shown wherever the account's name is
(collaborators, the "edited by" marker, the editor's avatars). Asked for with `?v={avatarAt}`, so a new
picture is a new address and the answer carries `Cache-Control: private, max-age=31536000, immutable`.
A browser that cannot draw JPEG XL shows the initials instead — there is no fallback decoder; see
`docs/PLATFORMS.md`. `404 avatar.not_found` when the account has no picture; `401` without a
session.

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
descending, so a note the caller pinned leads their views. `pinned` is the caller's own: the same note
can be pinned for its owner and not for a collaborator. `position` is Google Keep's own order: a new note, a
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
| `pinned` | **the caller's own**: pins or unpins the note for the caller alone, and anyone who can see the note may send it — a `VIEW` collaborator too, as long as nothing else is in the patch. Never version-guarded, never archived into the history. A change takes the note to the top of its section **in the caller's order alone** (the note's `position` in the caller's responses); the note's version, its `updated_at` and everybody else's order stay as they were, so nobody else is notified |
| `completedCollapsed` | **the caller's own**, like `pinned`: `true` folds the list's completed items away for the caller alone, `false` opens them again (`note_folds`). Anyone who can see the note may send it; never version-guarded, never archived into the history, and the note's version and `updated_at` stay, so nobody is notified |
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

### `POST /api/notes/{id}/seen`

The caller opened the note: its `unseenEdit` goes away for the caller alone, until somebody else
writes its content again. Anyone who can see the note may send it; no body. It is the caller's own
business, like a pin: the note's `version` stays and nobody is notified. Response `200`: the `Note`.

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

## Friends and groups

An account's own list of people it shares with, and named groups of them — like labels, the
account's alone: the friend is not asked or told, and nobody else ever sees the list. Being a friend
grants nothing; the share dialog uses the list to suggest people as the reader types, and picking a
group shares the note with each member through `POST /api/notes/{id}/shares`, one share at a time.

### `GET /api/friends`

Response `200`:

```json
{
  "friends": [ User, ... ],
  "groups": [ { "id": 3, "name": "Family", "memberIds": [2, 5] } ]
}
```

Friends in the order they were added, groups by name (`NOCASE`), each group's members in the order
they were added to it.

### `POST /api/friends`

`{ "login": "bob@example.com" }` — an e-mail address, or the username of an account that signs in with
one. Response `201`: the friend's `User`. `404 friend.not_found` when no account signs in as that,
`400 friend.self` for yourself, `409 friend.already_added`, `403 friend.limit_reached` past 500.

### `DELETE /api/friends/{userId}`

Response `204`. The friend also leaves every one of the caller's groups. `404 friend.not_found` when
the account is not a friend.

### `POST /api/friend-groups`

`{ "name": "Family", "memberIds": [2, 5] }` (`memberIds` optional) → `201` with the group. Names follow
a label's rules (1..50 characters, unique per account without case: `409 friend_group.name_taken`), and
every member must be one of the caller's friends (`400 friend_group.not_a_friend`). At most 100 groups.

### `PATCH /api/friend-groups/{id}`

`{ "name": "Relatives" }`, `{ "memberIds": [2] }` or both; a field left out is left as it is, and
`memberIds` replaces the members. Response `200` with the group. Another account's group is
`404 friend_group.not_found`, as is one that does not exist.

### `DELETE /api/friend-groups/{id}`

Response `204`.

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
  "version": "1.0.0-rc9",
  "demo": false,
  "registrationOpen": true,
  "trashRetentionDays": 30,
  "ssoProvider": "Pocket ID",
  "demoAccounts": []
}
```

`registrationOpen` says whether `POST /api/auth/register` would accept a sign-up right now — the
administrator's switch in the server settings, `false` until they open it; the sign-in screen hides
its "Create an account" link otherwise. `trashRetentionDays` is
`NOTKA_TRASH_RETENTION_DAYS`, which the trash states. `ssoProvider` is `NOTKA_OIDC_NAME` while an identity
provider is configured and `null` otherwise; the sign-in screen offers it only then.

No authentication required. `demoAccounts` lists the sample sign-ins a demo instance offers, and is
always empty unless the server was started with `DEMO=true`; it exists so the sign-in screen can
show them without a second copy of the credentials in the frontend.

---

## Background themes

Themes are uploaded by the administrator and chosen by every account for itself
(`docs/THEMES.md`). The built-in theme, `notka`, is not in the list: its pictures ship with the app.

### `GET /api/themes`

Open to anyone: a theme is the instance's look, not anybody's data, so the sign-in screen wears the
default one. Response `200`:

```json
{
  "themes": [
    {
      "id": "watercolour",
      "name": "Watercolour",
      "author": "Ada",
      "license": "CC0",
      "backgrounds": {
        "food": { "light": "/api/themes/watercolour/files/3", "dark": "/api/themes/watercolour/files/3", "tint": "#fbe4d8", "tintDark": null, "tonal": null, "tonalDark": null }
      },
      "logo": "/api/themes/watercolour/files/4",
      "highlight": "#fde3cf",
      "highlightDark": null
    }
  ],
  "defaultThemeId": "notka",
  "selectedThemeId": null
}
```

`selectedThemeId` is the account's own pick; `null` follows `defaultThemeId`, and is always `null`
without a session. `logo` is `null` for a
theme that keeps Notka's mark, and `highlight`/`highlightDark` (the sidebar's active entry) are `null`
where the theme leaves the built-in colour.

### `PUT /api/themes/selection`

Request: `{ "themeId": "watercolour" }`, or `null` to follow the default. Response `200`: the same
body as `GET /api/themes`. `404 theme.not_found` for a theme that does not exist.

### `GET /api/themes/{themeId}/files/{fileId}`

Open to anyone, like the list. The picture's bytes, `Cache-Control: public, max-age=31536000,
immutable` (a replaced theme gets new file ids), and a `Content-Security-Policy` with `sandbox`, so an SVG opened on its own runs nothing.

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
`409 mail.not_configured`, `409 admin.user_has_no_email`, `409 admin.user_has_no_password` (the account signs in through the identity provider), `503 mail.send_failed` — in every failure
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
