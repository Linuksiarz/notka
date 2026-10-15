# How Notka differs from Google Keep

Notka copies Google Keep's look and the way it is used as closely as it can — the numbers behind
that are in [`METRICS.md`](METRICS.md). This file lists the places where it **deliberately or
necessarily behaves differently**: what it adds, what it does its own way, and what it leaves out.

When a change makes Notka differ from the original, add it here.

---

## What Notka adds

| | Notka | Google Keep |
| --- | --- | --- |
| **Markdown in the editor** | Typing `# `, `## `, `### `, `- `, `* `, `1. ` or `[ ] ` at the start of a line turns it into a heading, a bullet, a numbered line or a checkbox; `**bold**`, `*italic*` / `_italic_`, `~~strike~~` and `` `code` `` work inline. | Formatting comes from the "A" menu only (headings, bold, italic, underline); no Markdown, and no bulleted or numbered lists. |
| **Bulleted and numbered lists in text notes** | A text note can hold bullets and numbered lines, nested one level. | Only checkbox lists. |
| **Markdown export and import** | *More → Download as Markdown* saves a note as a `.md` file — title, the labels as `#tags` after it the way Logseq writes them, the body, and the note's colour, pin, reminder and the rest in an HTML comment at the end ([`MARKDOWN.md`](MARKDOWN.md)). Several picked notes download as a `.zip` of such files. *Settings → Import notes* reads them back — or plain Markdown from Obsidian, Logseq and the like — and exporting then importing gives the same note. | Version history can be viewed, not downloaded; the only export is *Copy to Google Docs*. |
| **View-only sharing** | A collaborator is either *view only* or *can edit*. | Every collaborator can edit. |
| **Simultaneous typing is merged** | Two people typing into one note at once both keep every keystroke: the body is written as ProseMirror steps over a log the server orders, and the writer who is behind rebases ([`COLLABORATION.md`](COLLABORATION.md)). A title renamed offline over somebody else's becomes a note of its own. | Concurrent edits are merged silently and, by report, can leave text from both versions glued together. |
| **Reduced motion** | Follows the system's *reduce motion* setting by default, with an override in Settings. | Ignores the setting. |
| **British English** | Ships `en-US`, `en-GB` and `pl`. | Many languages, but no separate British English spelling. |
| **Configurable trash retention** | Trashed notes are purged after 30 days by default (`NOTKA_TRASH_RETENTION_DAYS`). | Fixed at 7 days. |
| **Self-hosted** | One container, one SQLite file, your own accounts (e-mail and password), "sign out of all devices". | A Google account and Google's servers. |
| **An administrator** | The instance has one, created from the environment on its first start. Its gear menu adds *Server settings*: open or close sign-up (closed by default), upload background themes and pick the instance's default, see what every account stores, delete an account or e-mail it a password reset. | Accounts are Google's to manage. |

## What Notka does differently

| | Notka | Google Keep |
| --- | --- | --- |
| **Colour and background are shared** | A note's colour and background belong to the note: everyone with access sees the same ones, and anyone who can edit changes them for everyone. | Colour is personal — a collaborator's choice never changes what the owner sees. |
| **Reminders are a view, not an alarm** | A reminder (a moment, optionally repeating) shows on the note and gathers it in the *Reminders* view, soonest first. There is no notification when it is due. | Sends a notification on every device; can also be tied to a place. |
| **Search runs on loaded notes** | Text search and the *Types / Labels / Colors* filters work on the notes already loaded in the browser. | Server-side search across everything, including archived notes and recognized image content. |
| **Search filter types** | *Reminders*, *Lists*, *Images*, *URLs*. | Also types for the media it supports (images, drawings, audio and more) and a *Things* panel built from image recognition. |
| **Indenting a list row** | Tab / Shift+Tab, Cmd/Ctrl + `]` / `[`, or dragging sideways. | Cmd/Ctrl + `]` / `[` and dragging. |
| **Settings** | Theme, animations, language, display name and password. | Item placement, link preview, reminder defaults and sharing options. |
| **A phone is the Android app** | Below 600px the chrome is the original's Android app's — the search pill with the layout and sort switches, the drawer with its Settings, one "+" with a menu of kinds of note, bottom sheets, cards without action bars picked by a held finger — and the system bar wears the colour at the top of the screen. | The web app on a phone is the desktop layout, narrowed. |
| **Sorting** | The sort sheet of the Android app — custom, date created, date modified — on a phone, remembered per device. | The Android app has it; the web app does not. |
| **Backgrounds** | The same nine, drawn by Notka's own CC0 artwork; the original's illustrations are an optional theme the administrator can upload, anyone can make another (`THEMES.md`), and every account picks its own. | Its own nine illustrations, fixed. |

## What Notka leaves out

- **Drawings and voice notes**, and what the original builds on pictures (OCR, *Grab image text*).
  Pictures themselves are supported, but are not part of the Markdown export yet.
- **The "A" formatting menu on a wide screen** — Markdown input covers formatting there; on a phone
  the "A" opens the formatting bar of the original's Android app (headings, bold, italic, underline).
- **Copy to Google Docs**, Google Workspace integration, and the *Google apps* launcher.
- **Location-based reminders** and reminder notifications.
- **Sending a note** to another app, and the *Send feedback*, *Help*, *Download the app* and
  *Keyboard shortcuts* entries of the gear menu.
- **Collaborator cursors** and presence.

The images and other media are left out on purpose for now; `ARCHITECTURE.md` describes where they
would plug in.
