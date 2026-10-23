# Roadmap

What is planned for Notka, and what Google Keep has that Notka does not yet. Where Notka differs from
Google Keep on purpose is in [`docs/DIFFERENCES.md`](docs/DIFFERENCES.md).

## Planned

- [ ] JPEG XL pictures: `ImageFormats` recognises `.jxl` by its bytes next to PNG, JPEG, GIF and WebP, in note pictures and in themes
- [ ] Pictures in the Markdown export
- [ ] Markdown export endpoint (the conversion is implemented, tested, and downloadable per version)
- [ ] Server-side search
- [ ] Keep's own snackbar instead of svelte-sonner: one notification at a time, with its action, that
      always goes away after its time. svelte-sonner holds a toast for as long as the pointer is over
      it and cannot be told not to, while the original's goes away regardless (measured 2026-10-14).

## What Google Keep has and Notka does not yet

With the effort each would take (compared again on 2026-10-19):

| Feature | Effort |
| --- | --- |
| *Undo* on the snackbar after deleting from the editor or the selection bar (a card's own delete already has it) | very small |
| *Send*: share a note to another app (Web Share API on a phone, a copy to the clipboard elsewhere) | very small |
| More of the Android app's launcher shortcuts: *New note* and *New photo* next to the existing *New list* | very small |
| Reminder presets (*Later today 8:00 PM*, *Tomorrow 8:00 AM*, *Next week Mon 8:00 AM*) and the default times for morning, afternoon and evening in Settings | small |
| Keyboard shortcuts: `c` new note, `l` new list, `/` search, `j`/`k` move between notes, `e` archive, `#` delete, `f` pin, `x` select, `Ctrl+G` grid or list, `?` the list of shortcuts | small |
| Settings: add new list items at the bottom, move ticked items to the bottom, show rich link previews, enable sharing | small each |
| Swiping a card sideways to archive it (the Android app) | small to medium |
| A notification when a reminder is due while the app is open | small to medium |
| *Find in note* (the Android app's ⋮ menu) | small to medium |
| Reminder notifications while the app is closed (Web Push from the server) | medium |
| Location reminders (*Pick a place*) | medium |
| *Grab image text*: the text of a picture, recognised on the device | large |

Done since the first comparison (2026-10-15): *Undo* after archiving, *Uncheck all* and *Delete
checked items* in the ⋮ menu on a wide screen, bulk pin, colour, labels, reminder and copy for picked
notes, receiving a share from another app, dragging notes into your own order, and label suggestions
after `#`.

## Out of scope

- **Drawings, voice notes and other media.** Pictures are implemented; the rest is not planned.
- **Collaborator cursors and presence.** That is a Google Docs feature. Two people typing into the
  same note are already merged keystroke by keystroke ([`docs/COLLABORATION.md`](docs/COLLABORATION.md)).
