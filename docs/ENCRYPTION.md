# Encryption of private notes

An account may have its **private** notes stored encrypted, so that whoever opens the database file —
the server's administrator, a backup, a copy of the disk — reads ciphertext instead of the notes.
It is off by default and switched on in Settings.

## What it protects against, and what it does not

The threat is an administrator who **looks into the database**: opens `notka.db` with `sqlite3`, reads
a backup. Against that, a sealed note's title, body, history, step log and pictures are AES-256-GCM
ciphertext, and the key that opens them is not in the file.

It is **not** end-to-end encryption. The server encrypts and decrypts, so it holds an account's key in
memory while the account is in use, and it sees the password at sign-in. An administrator who changes
the server's code, reads its memory or logs its requests can read the notes; so could one who serves a
different frontend. Data in transit is TLS's business, not this feature's. What stays readable in the
file is the notes' **metadata**: owner, kind, colour, background, pin, archive and trash state, reminder,
timestamps, order, sizes, labels (their names included) and who a note is shared with.

## When a note is sealed

`NoteSealing` decides, and the rule is the whole of it — a note is stored encrypted when:

1. its owner turned encryption on, **and**
2. it is shared with nobody — a collaborator reads it without the owner's password, **and**
3. the server does not need to read it for link previews: the owner switched link previews off, or the
   note has no links.

The rule is applied whenever the note's owner reads or writes it (`NoteService.resolveAll`, and the
sharing and settings changes), which is the one moment the owner's key is surely unlocked. A note
therefore follows its shares, its links and its owner's settings without a second place to keep in
step: sharing it stores it in the clear first, removing its last collaborator seals it again, typing a
link into it opens it (while previews are on), and changing a setting settles every note of the account.
The client is told the outcome as the note's `encryption` field (`ENCRYPTED`, `SHARED`,
`LINK_PREVIEWS`, `DISABLED`), and the editor's lock explains it.

What is sealed together with the note (`sealed_notes`, one row per sealed note): `notes.title` and
`notes.content`, every `note_versions` row, every `note_steps` row and every `note_images.data`. The
associated data of each value is where it is stored (`notes.title:42`), so a value moved to another
row or note does not open. Sealing and opening a note rewrite all of it in one transaction.

## Keys

| Key | Where it lives | Wrapped by |
| --- | --- | --- |
| The account's key (AES-256) | never stored unwrapped | each row of `account_key_wraps`, and each session |
| Password wrap | `account_key_wraps`, `PASSWORD` | PBKDF2-HMAC-SHA256 of the password, 600 000 rounds, its own salt (not the login hash's) |
| Recovery wrap | `account_key_wraps`, `RECOVERY` | HMAC-SHA256 of the recovery key: 160 random bits shown **once**, as Crockford base32 in groups of four |
| Session copy | `session_keys`, by the session's token hash | HMAC-SHA256 of the session cookie, which only the browser holds |
| In memory | `KeyRing`, by account | — let go after an hour unused (`SessionCleanupJob`) |

A request authenticates as before; `AccountKeys.unlockSession` then opens the account's key from the
session's copy into the `KeyRing`, where the repositories find it. A server restart therefore signs
nobody out. Sign-in with the password writes the session's copy. Turning encryption on asks for the
password again (it is what the key is wrapped with), writes both wraps and this session's copy, and
signs the other devices out: their sessions hold no copy, and signing in again gives them one.

A changed password re-wraps the same key; the recovery key and the sessions keep working. A
**password reset** — the forgotten password was what opened the key — needs the recovery key
(`POST /api/auth/password-reset` with `recoveryKey`). Without it the server answers
`409 auth.recovery_key_required`, and the reset goes through only with `discardEncrypted: true`: the
sealed notes, which nobody can open any more, are deleted, and the account starts without encryption.
Shared notes were never sealed and stay.

**SSO.** An account signing in through an identity provider has no password to wrap the key with. It
would get a wrap of its own — a separate encryption passphrase entered once per device after the
provider's sign-in — next to the recovery key, and nothing else here changes.

## Old copies in the file

SQLite leaves the bytes of an overwritten row in the page until something reuses the space. The
connections run with `secure_delete=on`, which overwrites freed space with zeros, so the clear text a
note had before it was sealed does not stay in the file (`NoteEncryptionTest`). Measured on 2 000
rewrites of 6 KB rows, it costs a few percent of a write. A database written before this setting may
still hold old fragments in pages nothing has rewritten since; `VACUUM` rebuilds the file without them.
