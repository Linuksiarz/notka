# End-to-end checks

Browser-driven checks that exercise the real stack. They are the only place where the things unit
tests cannot reach are verified: live collaboration between two accounts, the conflict warning, the
editor's DOM behaviour, and the visual result.

The Kotlin and Vitest suites stay the fast feedback loop; these run before a release or after
touching the editor, the sharing rules, or the live channel.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium   # once
brew install jpeg-xl                    # once, for the screenshots: provides cjxl
```

## Running

Every script takes the base URL as its first argument and defaults to `http://127.0.0.1:8080`.
Start the app the way you would normally run it (see the repository README) — with
`NOTKA_AUTH_ATTEMPTS_PER_MINUTE=10000`, because the suites register and sign in far more often
than the production limit of 10 a minute allows from one address, and with the administrator the
suites sign in as: `NOTKA_ADMIN_USERNAME=admin NOTKA_ADMIN_PASSWORD=e2e-admin-password` on an empty
database (or `E2E_ADMIN_LOGIN`/`E2E_ADMIN_PASSWORD` set to the pair it was first started with).
Sign-up starts closed, and every suite that needs it opens it first through `e2e/admin.mjs`. Then:

```bash
pnpm run e2e              # full application regression
pnpm run e2e:live         # live collaboration between two accounts
pnpm run e2e:concurrency  # two people typing into one note at the same moment
pnpm run e2e:editor       # editor interactions, against a stubbed API
pnpm run screenshots      # writes the images used in docs/images
```

Pass a different URL after `--`, for example `pnpm run e2e -- http://127.0.0.1:8090`.

## What each script covers

| Script | Needs a server | Needs `pnpm preview` | Checks |
| --- | --- | --- | --- |
| `e2e.mjs` | yes | no | 162 checks: registration, session, the administrator's server settings (only the administrator has them, every account with its storage, sign-up closed and opened, an uploaded theme becoming everyone's default and an account's own pick overriding it, the default going back to the built-in theme when its theme is removed), note lifecycle, archive with Undo on its snackbar, a new note surviving its own first autosave without the grid flickering, editing inline above the grid and settling into it, the folded rail, the room it frees for the notes (and the measured gutter beside it) with the notes in their new places at once and only the rail's panel animating, archive, version history and its download, sharing with the appearance rule, read-only collaborators, trash and its countdown, list notes (including indented lines, hiding and showing their checkboxes without the server refusing the note, and the editor's ⋮ unchecking every row and deleting the checked ones), bulk selection (the shared tick disc, the light ring, `Select all`, the trash's own restore, and the bar pinning, painting, labelling, reminding and copying every picked note), pinning and its headings (an unpinned note sliding to its section as the same card), labels (filtering from the sidebar and from a card's chip, a note leaving a filtered view when its label goes, a note written in a label's view being given that label, the label's name in the header, the labels' place under Reminders, its archived notes under an ARCHIVE heading, every background the picker offers having both theme variants on disk, the appearance picker carrying the original's measurements and hanging centred under its card, Settings keeping every section reachable and its motion toggle in Appearance), reminders (the view's own empty state and its 80px bell, the picker's measured 56px rows of date, time and repeat, the chip reading "Tomorrow, 8:00 AM", the note gathered into the view and leaving it again when the reminder is taken away), Polish locale, and the editor's presentation (the measured veil, a note opened from a scrolled list, the page holding still, a new note flying onto its card), dragging a card into place with the browser's own drag and drop (only in the custom order), and the label suggestions after `#` |
| `live.mjs` | yes | no | 10 checks: a collaborator's list and an idle open editor pick up someone else's edit with no refresh, a change made while the collaborator was offline reaches them once they are back, a note written offline closes, shows what was written and is sent once the connection returns, an offline write that meets somebody else's is kept as a note of its own (and the writer is told), and the installed app opens its notes without a connection |
| `concurrency.mjs` | yes | no | 7 checks: two people typing into one shared note at the same moment — in different lines and in the same line — both keep every keystroke, the one still typing keeps their caret, nobody is warned, and the server and both screens converge on one body |
| `smoke.mjs` | no | yes | 57 checks: nothing to undo right after opening a note, no caret left behind once it closes, Markdown-as-you-type, checklist toggling, inline formatting, a typed address turning into a link and the link cards the server sent (a row filled with the overlay the original uses, lighter than the note), the appearance picker (a colour and a background held at the same time, each with its own tick, the line between the two groups, and the "no background" tile the size of the tiles beside it), keyboard handling, the completed-items section and the six-dot handles it draws for active rows only, the drag's own rules (a grab holds the row until the hand travels past the slop, the band is the carried row's own box on the note's own width with nothing else drawn, picking a row up moves nothing and the list keeps its height while the rows give way, the row lands where it was drawn rather than one place either side, a whole drag is one undo and Escape writes nothing), the levels (Tab stops at one, one level is the measured 25px, a sideways pull changes it and pulling back changes it again, and no gesture can write a second level), the row's own ✕ — on the row under the pointer, inside its edge — deleting that row in one change that one undo takes back, the demo sign-in, and the grid's own rule that picking a note moves nothing (every card keeps its place and its height, link previews included) |
| `mobile.mjs` | yes | no | 35 checks at a phone's size (412x893 at 3.375x, the owner's own device): two columns of 192px cards with no pin and no action bar, the smaller card type (16px/20px title, 12px/15px text), a top bar with no wordmark, no sideways scroll and the layout and sort switches in the search pill, the "+" menu (Image, List, Text, a 60px close button), the sort sheet, picking a card with a held finger, the drawer (name, Settings, full height), the Android app's surfaces (page, search pill, drawer and its veil, a plain card and its outline), a note growing out of its card on transforms and opacity alone with the system bar fading to its colour as it slides in under the bar and back as it leaves, the editor's own bar (back arrow, pin, reminder, archive on 43px buttons) that stays put while the note scrolls, the colour sheet and the reminder picker inside the window at 360, 393 and 412px, the checklist's Android geometry (checkbox 66px, text 101px, handle 32px, level 40px), nothing to undo right after opening a note, the "A" formatting bar, the list's own ⋮ (delete checked), ticking a row without raising the keyboard while an active row's text does, the ⋮ sheet, and sharing into the installed app from another app (the manifest's share target; a title, text, link and picture becoming a note that opens, and a share received offline kept on the device without its picture and sent once the connection is back). Runs in Chromium and Firefox: `node e2e/mobile.mjs <url> [firefox]` |
| `capture.mjs` | no | yes | writes the screenshots referenced by `docs/images` in the dark theme (desktop, Polish, appearance picker, mobile and its editor), as lossless JPEG XL |
| `appearance-capture.mjs` | no | yes | writes `docs/images/notka-appearance-picker.jxl`: the picker with a colour and a background both chosen, beside the original's own picker in `docs/METRICS.md` |
| `drag-capture.mjs` | no | yes | writes `docs/images/notka-drag-carrying.jxl`: our editor carrying a checklist row, staged like the original's `keep-drag-3-move.webp` (`node e2e/drag-capture.mjs <url> [output.jxl]`) |

`smoke.mjs` and `capture.mjs` stub `/api/**` in the browser, so they need `frontend/dist` served —
`pnpm run build && pnpm run preview` — and no backend.

## Notes for sandboxes

If `$HOME` is read-only, point Playwright's browser cache at the workspace and keep Gradle's home
local too:

```bash
PLAYWRIGHT_BROWSERS_PATH=$PWD/../.playwright pnpm exec playwright install chromium
GRADLE_USER_HOME=$PWD/../.gradle-home ./gradlew :backend:shadowJar
```

`live.mjs` and `concurrency.mjs` create accounts with unique emails on every run, so they can be run
repeatedly against the same database.

`e2e.mjs` downloads a version file, so the browser context must accept downloads — Playwright's
default.
