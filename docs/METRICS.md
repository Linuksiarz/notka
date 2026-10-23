# Measurements

Every number in this file was measured from the original, in pixels, off a screenshot — never
guessed. It is the record `AGENTS.md` rule 19 points at: the rule says metrics come off the original
and that changing one needs a new measurement; the measurements themselves live here, because
`AGENTS.md` had grown past the size the agent harness will deliver whole.

**Changing any number here needs a new measurement from the original, not an opinion.**

The screenshots of the original that measurements below cite by name (`keep-drag-1-resting.webp`,
`keep-appearance-picker.png`, `keep-link-cards.webp`, …) are the owner's and are **not kept in the
repository**: they show Google's app and its artwork. The numbers read off them are what is recorded
here; ours, shot the same way, are in `docs/images/notka-*.jxl`.

## Re-measured from the original's DOM (2026-10-13)

Read with `getBoundingClientRect`/`getComputedStyle` off keep.google.com itself — signed in, light
theme, a 1400×900 window, Polish locale — which is exact where a screenshot is an estimate. Where
it disagrees with an older screenshot reading below, **this one wins**, and the token now carries it:

| | original (DOM) | was | where |
| --- | --- | --- | --- |
| top bar height | **64** (1px inset line `rgb(218,220,224)`) | 67 | `--keep-topbar-height` |
| drawer / nav pill width | **280** | 283 | `--keep-sidebar-width` |
| nav label left / icon column | **81 / 36** (menu button 48px at x=12) | 85 / 39 | `--keep-nav-label-left`, `--keep-icon-column` |
| search field | x **250**, **722**×48, centred in the bar | 253, 720 | `--keep-search-left`, `TopBar.svelte` |
| bar buttons | **48×48**, contiguous; account 40px, 14px from the edge | 40, 2px apart | `TopBar.svelte` (a phone keeps 40) |
| composer | **32** under the bar, 600×46, no border, `0 1px 2px rgba(60,64,67,.3), 0 2px 6px 2px rgba(60,64,67,.15)` | 33, 1px border, black shadow | `--keep-notes-top`, `--keep-shadow-composer` (light; dark keeps its own) |
| card | title 20px on **25px**; hover shadow `0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)` | 26px line | `NoteCard.svelte`, `--keep-shadow-card-hover` |
| icon glyphs | **24px** in the top bar, the selection bar, the navigation and the editor's pin (and the phone editor's own bar); **18px** on a card's and the editor's action bar — re-measured 2026-10-14 off the DOM at 412px and on the desktop (Keep's `background-size`) | 22px in the bars and the navigation, 20px for the pin | `TopBar.svelte`, `Sidebar.svelte`, `NoteEditor.svelte`, `--keep-nav-icon-size` |
| card actions | **34px** buttons, 4px in from the sides, 5px above the bottom, 18px glyphs, ink at **71%** | 40px, 75% of the secondary ink | `NoteCard.svelte` |
| card pin | **34px**, 6px from the top, 8px from the right | 32px at 4/4 | `NoteCard.svelte` |
| open note | 600 wide, `0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)`, radius 8 | elevation-2 | `--keep-shadow-editor` (light) |
| editor title | **20px / 24px**, regular | 24px / 32px medium | `NoteEditor.svelte` (rule 21) |
| editor bar | **34px** buttons on a **50px** pitch from 9px in; Undo and Redo after ⋮; "Close" **100×36** | 40px on 42px | `NoteEditor.svelte` |
| "Edited" line | 12px Roboto, right-aligned on its own line above the bar, the **time** ("Edytowano 21:31") | relative ("2 minutes ago"), beside Close | `NoteEditor.svelte`, `formatEditedAt` |
| veil under an open note | `rgb(32,33,36)` at **60%** (light) | white at 73% | `--keep-scrim` (light; dark keeps 73%) |
| checklist rows | **38px** pitch, ✕ 26px | — | unchanged, confirmed |

**Pictures** follow the original's behaviour — above the title, edge to edge, rows of at most three
sharing a height, the bin on a dark square in a picture's corner, full size in a dark viewer — but
their numbers are **not measured**: the session that measured the rest could not upload a file to the
original. Measure them before tuning.

The **dark theme** was measured the same way, with the original's own switch (gear → "Enable dark
theme"; the original ignores the system's scheme):

| | original (DOM) | was | where |
| --- | --- | --- | --- |
| composer | 1px `#5f6368` inside, `0 1px 2px rgba(0,0,0,.6), 0 2px 6px 2px rgba(0,0,0,.3)` outside — and in the light theme a 1px `#e0e0e0` inside as well | `.75`/`.25`, 2px 4px 1px | `--keep-shadow-composer`, `--keep-border` |
| open note | `0 1px 3px rgba(0,0,0,.6), 0 4px 8px 3px rgba(0,0,0,.3)` | `.6`/`.35`, 2px 6px 2px | `--keep-shadow-editor` (dark) |
| veil | `rgb(32,33,36)` at **75%** | 73% | `--keep-scrim` (dark) |
| a coloured note | its 1px border is its own colour — no outline | outlined in `--keep-border` | `palette.css` (the outline stays on plain notes and artwork) |
| card icons | white glyphs at 71% | — | confirmed |

**The palette** is the original's current one, read from its colour picker in both themes (the
names are the original's own; the ids stay the API's):

| id | name | light | dark |
| --- | --- | --- | --- |
| red | Coral | `#faafa8` | `#77172e` |
| orange | Peach | `#f39f76` | `#692b17` |
| yellow | Sand | `#fff8b8` | `#7c4a03` |
| green | Mint | `#e2f6d3` | `#264d3b` |
| teal | Sage | `#b4ddd3` | `#0c625d` |
| blue | Fog | `#d4e4ed` | `#256377` |
| darkblue | Storm | `#aeccdc` | `#284255` |
| purple | Dusk | `#d3bfdb` | `#472e5b` |
| pink | Blossom | `#f6e2dd` | `#6c394f` |
| brown | Clay | `#e9e3d4` | `#4b443a` |
| gray | Chalk | `#efeff1` | `#232427` |

The **gear opens a menu**, not the settings: a 4px-radius panel, 6px above and below, rows of 32px
with 14px text 17px in — "Settings", "Enable/Disable dark theme" first. A **list card** draws a 1px
line at 10% ink 5px under its last active row, the "completed" heading 15px under it; the editor
draws the same line, and its "+ List item" row (39px) sits between the active rows and that line.
A card's hover bar is colour, reminder, collaborator, (image), archive, more.

The search page (`#search`) is a column of panels, max 800px wide with 80px side margins (so 640px
panels), 16px apart: a white card with `0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px
rgba(60,64,67,.15)`, square corners, a 40px header (15px/500 Roboto, 10px padding), then square tiles
four to a row with 4px between them — "type" tiles `rgb(26,115,232)` with white ink, label tiles
`rgb(245,245,245)`, the glyph a quarter of the tile's width — and the colour panel's 36px circles
(1px `rgba(0,0,0,.42)`) eight to a row in a 51px band. Its "Things" panel is image recognition and
has no counterpart here. The dark theme could not be measured: the original does not follow the
system's scheme, only an account setting.

### Re-measured from the original's DOM (2026-10-22)

keep.google.com, signed in, light theme, 1400×900, Polish locale:

- **The header's line is an inset shadow** (`inset 0 -1px 0 #dadce0`), not a border, so the bar keeps
  its whole 64px and everything in it is centred on y=32. Ours was a border, which put the menu and
  the logo half a pixel high.
- **The name** is 22px at **regular** weight (ours was 500 with 0.2px tracking), no tracking, on a 48px
  line, its text starting at **x=112**. The original's face is Product Sans, which is not ours to ship;
  Google Sans is its open sibling (49.5 against 51.2px for "Keep").
- **The logo** is a 48px picture drawn 44×40 at (64, 12); its ink is **32×38px** from (70, 13). Our own
  mark is drawn 46px so that its ink is the same size and place.
- **The sidebar's glyphs** are `#5f6368` at rest and `#202124` on the active entry (ours were all
  `#202124`); its labels are Google Sans 14px/500 with **0.25px** tracking.
- **The search field's hint** is `#444746`.
- **No font smoothing of its own**: the original leaves `-webkit-font-smoothing` at `auto`. Ours set
  `antialiased`, which draws every face thinner on a Mac — the same Google Sans file (identical advance
  widths, checked on both pages) looked like another face in the search field and the sidebar.
- **The first card stands 32px under the composer's box**; a first section heading stands at 48px,
  16px further down (`--keep-first-heading-offset`). Ours put the cards at 48px when nothing was pinned.

## Where the numbers come from

Keep's look is a number measured from a screenshot — pixels, not opinions — and written down here.
Most of it was measured from a **1718px dark-theme window** (all values are CSS pixels at 1:1; the
cards came out exactly 240 wide, which is how the scale was checked), and the phone section from the
owner's own 412×893 screenshots of both apps.
- **Chrome**: the top bar is **67px** to its divider; its icons are the **lighter** grey,
  `rgba(232,234,237,0.8)` in dark (measured 188–196 on a 33 background, where we used the 154 of
  the secondary text); the hamburger's ink is **18×12 at (30,30)** from the window's corner.
- **Search field**: **48px tall, starting at x=253** and 722 wide, its fill **(40,42,44)** (darker
  than the surface variant), a **24px** magnifier **16px** in, the hint **57px** in (16 + 24 + 17)
  and the same light grey as the bar's icons — measured (197,199,200) where we used the secondary
  text's (154,160,166), and its "Search" ink 49px wide, which is what says the size and weight are
  right. The measurement put the original's box at y 12..60 (12px above it, 6 below); the owner read
  our 13/8 as "extra space at the top", so the bar's content is **centred evenly** instead — the
  one place a measurement was overruled by the person looking at it.
  The 253px is a rule, not a coincidence of text width: our wordmark ("Notka") is longer than the
  original's ("Keep"), so the menu button and the wordmark share one `.brand-block` whose width is
  `--keep-search-left` minus the bar's padding. Do not put a fixed width on the wordmark itself —
  that is what an earlier attempt did, and it silently broke the moment the text changed.
- **Composer**: the header leaves **33px** before it (not the 42px measured from an older
  screenshot — remeasure, never trust the number), the box is **600×46** with **16px** text, and
  its shadow is Material's elevation-1: the page is **14 units darker** just below it and the
  shadow is gone within 6px (a tight, dark line, not our wider two-layer blur).
- **The open composer** (measured 2026-10-14, frame by frame): clicking "Take a note…" turns the
  600×46 box into a **600×137** editor in a single frame — no transform, no fade — and the notes below
  move down at once; closing an empty one is just as instant. The title's box is 41px (16px above a
  25px line), the body one line with **12px** under it and the "Take a note…" placeholder in it, then
  the bar; the caret lands in the **body**. Ours measures 134px.
- **Grid**: the notes are **centred** in the room beside the rail — there is no fixed gutter. At
  1718px wide with the 283px drawer the first column starts at **369** and the last ends at
  **1632**, i.e. 86px of leftover on each side. It is the centring, not a padding, so the numbers
  move with the window. **A column fits only with 16px left on both sides of the cards**
  (`--keep-grid-margin`, re-measured 2026-10-14 by narrowing the original's window: 528px of room
  beside the rail holds two 240px columns, 527px holds one). Ours let the cards run to the very edge
  of their room, which the owner read as the notes being too wide and the right edge too close to the
  window's — and it put the leftmost card's tick box under the rail. The notes' block (`.sections`) is the thing that gets the width — of a
  whole number of columns, or the list layout's 720px — and the stylesheet centres it; the section
  headings live inside that block, which is why a heading needs nothing but `padding-left: 16px` to
  line up with the cards. Do not go back to centring the grid inside a full-width wrapper: that put
  the headings somewhere else and needed their indent measured in JavaScript and handed back as a
  variable.
- **Pinning and unpinning** move the **same card**: the original's cards carry
  `transition: transform 0.218s`, and a note changing sections slides from its old place to its new
  one while every other note slides to make room — one 218ms move on the standard curve, no fade, no
  scale, the headings appearing and going at once (measured frame by frame on keep.google.com,
  2026-10-14). Ours used to fade the card out of one section — keeping its room for the fade — and
  scale a new one into the other, which the owner called chaotic. `MOTION.regrid` is that 218ms.
- **Sections**: the composer's box leaves **48px** before the first heading (and **32px** before the first card when there is no heading — see 2026-10-22 below), the heading **8px**
  before its cards (its *ink* 13px above the card's top), one section's cards **97px** before the
  next, and the heading's ink starts **16px right of the cards' left edge** — which is a plain
  `padding-left: 16px`, because the headings live in the same block as the cards (see the grid
  entry above).
- **Cards**: **16px** of padding in both directions — the title's ink starts **21px** below the
  card's top and **18px** from its left — the title is **20px/26px regular** and its baseline sits
  **25px** above the first body line; the card is **flat in both themes** (a plain note carries a
  1px light border, a coloured one needs none because it is its own surface).
- **The appearance picker** (the palette panel a card opens) is measured in its own right, from
  the owner's light-theme screenshot of the original: it is **sized by its content** — Keep's own
  is 462×110 for its 9 backgrounds — with an **8px radius** and **8px vertical / 12px horizontal
  padding**, its two rows **12px apart**. A colour swatch is a **32px circle with a 4px gap**
  (centres 36px apart), a background swatch a **40px circle with a 4px gap** (centres 44px apart),
  and the chosen one wears a **2px ring** in the accent plus an **18px tick badge** in the accent
  at its top-right corner. The two "none" choices carry **icons, not bare lines** — a droplet with
  a slash for no colour, a picture with a slash for no background — which is what "the icons are
  missing" was. And **it hangs from the card, centred, 2px under its bottom edge**
  (`customAnchor` on the card, not on the button that opens it, which is where ours was).
  Keep's own row offers **none + 9** backgrounds, and so does ours. The ring and badge use our accent; the original in
  that screenshot rings them in a Material-You purple (measured `rgb(161,69,244)`), which is its
  theme's accent rather than a number of this design.
- **Link cards**, measured from the owner's screenshots of the original (both crops are 1:1 — the
  card is 240 wide in each, which is how the scale was checked):
  - The **card's own note text is 16px on a 24px line**. Ours inherited the app's 14px, and the
    tell is the same address wrapping into **four** lines there and **three** here.
  - An address written **plainly in the text** is painted in the link colour and underlined, on
    the card *and* in the editor — re-measured 2026-10-14 off the owner's screenshots in both themes:
    `rgb(40,84,197)` in the light theme, and in the dark one the note's own ink `rgb(232,234,237)`,
    underlined (`--keep-note-link`; an older screenshot read a Material-You accent). In the editor it is a
    **decoration** (`boundary/editor/linkify.ts`), because marking the document on open would turn
    every open into a write. Ours inherited the note's own colour and read as ordinary black text.
  - On a **card** the block **bleeds**: its hairlines run from the card's left edge to its right
    one, with square corners and no side padding, whereas the editor's block is inset with an 8px
    radius. Ours drew the card's as a floating rounded box inside the 16px padding.
  - A row is a **56×56 thumbnail cell** at its left edge — the picture fills it, and a page
    without one leaves it empty — and the text beside it. A card row is **57px** = its top hairline
    **1** + 56. **The editor's rows are 56px cards of their own**, 568 wide in a 600px note (16px in
    from each side), **15px** apart, an 8px radius and Material's elevation-1 shadow; the first is
    35px under the middle of the "Edited" line, which stands **above** them, and the bar's icons
    are centred 36px under the last (re-measured 2026-10-14; an older reading had a 72px row in one
    bordered block). The title is one line on both surfaces.
  - The card's "open" glyph is ~10px, **8px** from the row's top and right edges; the editor's ⋮
    is centred 24px in from the row's right edge.
  - The hairlines between a card's rows are `rgb(220,220,220)` in the light theme and
    `rgb(140,142,145)` in the dark one (`--keep-link-divider`), not the card's border colour.
  - The line under the title is the **host** the note links to (`chipolo.net`), *not* the page's
    own `og:site_name` (which would read "Chipolo"). `siteName` stays in the API as part of what
    the page said about itself; the view shows the host, as the original does.
  - On a card the block sits at the **very end**, *under* the room the action bar takes: measured,
    the last row's hairline **is** the card's bottom edge (the gap below the block is the card's
    own 1px border), and the 48px action bar stands between the note's text and the previews. Ours
    put the block above the action bar, so the card ended in an empty band.
  - The title is **14px/500** on both surfaces, clamped to two lines in the editor and one on the
    card; the site line is 12px in the secondary colour; the action on the right is a 40px hit
    area carrying an "open in a new tab" glyph on the card and a ⋮ menu (Open link / Copy link) in
    the editor — the original's own two treatments. The rows **share their hairline borders**: a
    bordered block with dividers, not a stack of separate cards.
- **Reminders**, measured from the owner's screenshot of the original (1475×820, 1:1):
  the editor's **bell** is a 13×18px glyph at its top right, its centre 43px from the card's
  edge; the **picker** is 319×244 with the title's rule 32px under its top, a 20px inner padding,
  **56px rows** (date, time, repeat) and **Save** in the accent at the bottom right; the **chip**
  under the note's text is a pill whose text is 12px (its ink 9px tall) with a clock at its left;
  and the empty state is an **80px** bell over a 16px caption 37px below it. The view is flat (no
  Pinned/Others headings — it is ordered by time) and has **no composer**: a note written there
  would not carry the reminder the view is about.
- **Sidebar**: the order is the original's — Notes, Reminders, the labels, Edit labels, Archive,
  Trash — so the labels are part of the navigation rather than a block under a divider. The drawer
  is **283px** (the nav pill's right edge, which is its widest point), an item is **48px** tall, its icon is centred **39px** in and its label starts at **85px** — the
  hamburger in the header is centred at the same 39px, and the folded rail's circle has to keep
  that column too (rule 14). Measure that 48 from the **pitch of the rows**, not from the active
  pill's height: the pill's antialiased edge rows read as amber, which is how a measurement of "50"
  once pushed every row 2px further down than the one above it.
- **Folding and unfolding the rail**, measured frame by frame on 2026-10-15 (1440px window): the
  panel's width goes 80↔280 in **~140ms** on the standard curve (its transition is `150ms
  cubic-bezier(0.4, 0, 0.2, 1)`), and the notes are **already in their new places synchronously after
  the click** — a card at x=129 is at x=357 before the first frame, and the composer moves 460→560 the
  same way — so nothing but the panel moves. The narrow layout's drawer slides on the same 150ms, in
  and out.
- **The header lifts when the page scrolls**: its 1px line becomes transparent and a shadow takes
  its place (Material's raised app bar), and it goes flat again at the top. Ours kept the line
  for ever, which the owner spotted before any tooling did.
- **The editor's bottom bar wears the note's background**, picture included: the bar, the
  "Edited …" line and the link previews are transparent, so a note's artwork runs under them to the
  note's bottom edge. An earlier reading made them opaque in the note's `--note-bg`
  (`rgb(241,228,222)` for `#f1e4de`); the owner, looking at it, overruled that (2026-10-16: "ten
  pasek powinien mieć tło notatki a nie jednolite tło koloru notatki").
- **The scrollbar is the browser's own, and it is there from the start**: the root reserves it
  (`overflow-y: scroll`), which also keeps the centring from shifting sideways when the notes grow
  past the window. Do **not** restyle it — we once shipped a slimmer one and the owner saw it as
  "much smaller than Google Keep's". Mobile browsers overlay theirs, and that is theirs to decide.
- **A phone**, measured from the owner's own screenshots of both apps on the same device — a
  **412×893** CSS px window at **3.375×** (1391×3014 device px), so the two can be compared pixel
  for pixel:
  - **Two cards side by side**, 192px wide with a **10px** gutter and ~8px at the sides
    (2 × 192 + 10 = 394 of the 396 the window leaves). Their first and second columns start at
    9.8px and 211.6px; ours start at **9** and **211**. A phone is *not* a one-column layout: that
    was our own `@media (max-width: 600px) { .grid { columns: 1 } }`, and the list is a view the
    reader picks, not the one they are given for having a small screen — the grid is the default
    on every width.
  - **Smaller card type** *(superseded 2026-10-22, see "The Android app's own resources" below: that phone
    had its system text set to about 0.73, which is the device's to apply, not ours)*: the title's ink is 13.3px there against our 15.7px, and the text's line
    pitch 15.1px against our 20.6px — the same text in the same card, so the ratio is the
    measurement. Ours becomes **16px/20px** for a card title and **12px/15px** for its text, with
    the headings taking the same 0.75 (20/18/16px → 15/13.5/12px). A card only: the editor keeps
    its own type (`--keep-*` in `NoteContent.svelte`, `NoteCard.svelte`).
  - **The phone's surfaces are the Android app's colour scheme**, measured 2026-10-17 off the app on
    an emulator (1391×3014, 412dp) in both themes, after the owner saw the dark page differ:

    | surface | light | dark | ours |
    | --- | --- | --- | --- |
    | page, top bar, status bar | `#eeedf4` | `#1e1f25` | `--keep-bg` |
    | plain card, plain note's editor, drawer | `#faf8ff` | `#121318` | `--keep-surface` |
    | a plain card's 1dp outline, the drawer's rules | `#c5c6d0` | `#45464f` | `--keep-border`, `--keep-divider` |
    | search pill | `#faf8ff` | `#38393f` | `--keep-search-bg` |
    | drawer's active row (fill / ink), the "+" button | `#dae2ff` / `#314578` | `#314578` / `#dae2ff` | `--keep-active`, `--keep-fab-container` |
    | veil under the drawer | 60% black (238 → 95) | 60% black (30 → 12) | `.scrim` |

    The web original's dark page and plain cards are one `#202124`; the app's page is a step
    *lighter* than its cards. The set is the phone block at the end of `tokens.css`; the desktop
    keeps the web original's.
  - **The phone's top bar has no wordmark**: the original's is a hamburger and a search pill with
    the actions at the right. Reserving 253px for a wordmark *and* letting the search keep its
    input's intrinsic ~191px pushed the actions **183px** off a 412px screen, which is what "widok
    się rozjeżdża na boki" was; the bar's own overflow is now 0.
  - **Re-measured 2026-10-14 off the owner's screenshots of the Android app** *(that phone's display
    size is scaled up by about 7%; the drawer, the checklist and the colour sheet below are superseded
    by the emulator's numbers in "The Android app's own resources")* (923 px for 412 CSS px,
    2.24 px each): the app draws its glyphs at **26px** (the menu, layout and back glyphs' ink is
    ~19.6px), the search is a full **60px** pill with no line under the bar, the first card stands
    **21px** under it, the drawer is **326px** wide with **59px** rows (the active one a full pill from
    13 to 313px, the icon centred 43px in, the label at 73px), and the "+" is one **86px** button with a
    20px radius, a 36px glyph and Material's primary container (`#304678` / `#d9e2ff` in the dark).
    In the editor every action sat on a **43px tonal button** (superseded below by the emulator's 40px) — rounded squares (12px radius) for the
    pin, the bell and the archive in the top bar, circles in the bottom one (colour, picture, undo,
    redo, ⋮) — 9px apart; the checklist's box is **19px**, its text **16px**, its rows **52px**
    apart, and the title 22px.
  - **The app's own chrome, measured 2026-10-15** off the owner's second set of Android screenshots
    (same scale). These replace the web original's widgets on a phone, not just their sizes:
    - **Cards** carry no pin and no action bar. A tap opens the note; a held finger picks it
      (Android's own 400ms long-press timeout and 8px slop), which is how a phone reaches the bulk
      actions.
    - **The search pill** has no magnifier (its hint starts 25px in) and holds the layout and sort
      switches, centred 90px and 34px from its right end; the gear is gone from the bar, and the
      drawer ends with **Settings** instead.
    - **The drawer** opens with the app's name (28px, 21px in, centred on the bar), then the views, a
      rule from 30 to 296px, a `Labels` / `Edit` heading over the labels and `Create new label`,
      another rule, then the archive, the trash and the settings. It is the window's full height.
    - **Sort** is a bottom sheet: `Sort by`, a 1px `rgb(69,69,71)` rule 64px under its top, then
      `Custom (default)`, `Date created`, `Date modified` as 52px rows, the picked one on a
      `rgb(63,70,89)` pill 9px in from either side with its tick centred 47px in and the label at 86px.
      The sheet is `rgb(37,37,39)`.
    - **The "+"** opens a menu instead of a note: the 86px square becomes a **60px circle** sharing its
      top right corner, `rgb(55,122,255)` with a white "×", the page dims to 40% of itself, and the
      kinds rise above it as **59px** pills 5px apart, the lowest 9px over the circle, in the FAB's own
      primary container — a 26px glyph centred 38px in, the label 9px after it. The original's
      kinds are Image, Drawing, Audio, List, Text; Notka has no drawings or recordings (rule 8).
    - **The editor's bottom bar** is `add` (⊞) and the colours at the left, undo/redo and the ⋮ at the
      right. Each opens a **bottom sheet** wearing the note's colour: `add` holds Take photo and Add
      image; the colours are two rows under `Colour` and `Background` headings, 51px and 68px
      circles 23px and 14px apart, scrolling sideways; the ⋮ sheet's heading is the note's "Edited …"
      line (which therefore leaves the editor's body on a phone) over 52px rows — a 24px glyph centred
      38px in, the label at 77px. A sheet has a 28px top radius and dims what is under it by a third.
    - **The "A"** (third in the bottom bar, greyed out while the body has no caret) swaps the bar for
      the formatting bar: H1, H2 and "Aa" (plain text), a thin rule, B, I and U, a rule, and a ✕ where
      the ⋮ stood — the same 43px places, bare, with the kind or mark in force on a neutral rounded
      square (`rgb(61,61,61)` on an orange note in the dark theme). A list row has no heading kinds.
      The page asks the browser to shrink the layout for the on-screen keyboard
      (`interactive-widget=resizes-content`), so the bar stands on the keyboard as the app's does. A browser that ignores that hint (the layout stays as tall as the screen) would leave the bar under the keyboard, so the phone's editor also stands in the *visual* viewport (`--vv-top`/`--vv-height`, `boundary/visualViewport.ts`); checked on an Android emulator in Chrome, with and without the hint. **A note's background picture is sized by the tallest the visible part has been** (`--vv-tallest`), not by the box the keyboard leaves, and anchored at the top: the picture keeps its scale and place while the keyboard comes and goes, and while a list grows past the screen (checked on the emulator for a text note and a checklist). The bottom bar's buttons lie straight on the picture, as in the original's.
    - **A list note's title carries a ⋮** (centred 33px from the right edge, a 24px secondary glyph)
      whose sheet holds the list's own actions — uncheck all, delete checked, hide checkboxes — which
      therefore leave the main ⋮ sheet of a list note.
    - **The checklist** stands further in: the note's text starts **21px** from the screen's edge, the
      checkbox **66px**, its handle centred at **32px** with a 24px glyph, the text at **101px**, and
      one level is **40px**. `RichText`'s `PHONE_LIST` holds those numbers and gives the stylesheet its
      inset and indent, so the drag reads the same level the rows are drawn at.
  - **Opening and closing a note on a phone** is the original's container transform, recorded on the
    emulator with the system's animations slowed ten times (2026-10-17, a note with a background
    picture): the open note is drawn **whole, uniformly scaled** to the container's width from the first
    frame — bars, text and picture alike, nothing stretched — and the container cuts it off at its bottom
    edge while it grows from the card's rectangle to the screen's in about a quarter of a second, so the
    bottom bar appears only as the container reaches the bottom. The card's content shows under it for
    the first fifth. Closing takes 200ms: what is written fades in the first third, the container lands
    on the card, and the card shows through it in the last quarter, over a list that is already showing.
    Ours is transforms and opacity only (`editorFlight.ts`), so the compositor runs it whatever the page
    is doing; the clip-path and width it replaced ran on the main thread and stuttered on a phone. The
    original draws under a transparent status bar, so the note slides in under the bar over the last
    stretch of its growth; ours is one colour, so it fades from the page's to the note's by how much of
    a 32px band the note's top edge, width and opacity cover on each frame — and back as the note leaves
    the top (`systemBar.ts`). Switching it at the tap looked like the bar lighting up; switching it when
    the note arrived flickered. A tap draws no highlight of its own (`-webkit-tap-highlight-color`):
    Android's browser veiled the card for as long as the finger was down, so it lit up, waited for the
    finger to lift, and only then grew. The system's Back leaves the note, not the app: the open editor owns one
    history entry (`ui.openEditor`), and Back finishes the note as Escape does.
  - **A card's checkbox on a phone** is 0.78 of the text (11dp beside 14sp in the app) and centred on
    the capitals of its first line, to 0.4dp; ours centres a 0.78em box on the first line (`1lh`).
  - **Dragging a list row** follows the finger through one custom property (`--drag-carried-y`); the
    editor hears about the drag only when the landing place changes, never per frame.
  - **The editor's glyphs and tonal buttons, measured 2026-10-15** on the Android app in an emulator
    (1391×3014 at 540dpi = 412dp; every colour, both themes) and on the owner's screenshot of a dark
    yellow note:
    - the glyphs are **24dp** (ink 16.0px back arrow, 18.1px add, 13.9×19.8 pin — the same on both);
    - the buttons' fill is **a colour of its own per note colour and theme**, not an overlay, and
      the emulator's yellow (`#683d00`) is the owner's phone's (`rgb(103,61,0)`): the table is
      `--note-tonal` in `palette.css`. A plain note's is drawn from the device's own colour scheme
      (`#eeedf4` on `#faf8ff` in the light theme, `#292a2f` on `#121318` in the dark), so it stays
      `--keep-tonal-button`;
    - the buttons are **40dp** (40.3 measured), 8dp apart, the top bar's last one 24dp from the edge
      and the bottom bar's first 20dp from it; the ⋮ is a **32dp-wide pill**. The owner's phone
      showed 42.5dp with the same glyphs; the owner chose the emulator's numbers;
    - **the ink is the app's own pair on every note colour**: `#1a1b21` (text) and `#45464f`
      (glyphs) in the light theme, `#e3e2e9` and `#c5c6d0` in the dark — `--keep-phone-ink` and
      `--keep-phone-glyph`, applied to the phone's editor in `palette.css`. The owner's phone drew
      pure white on a dark note; the owner chose the emulator's values.
  - **The editor carries a bar of its own** (59px since the re-measurement above; it was 48):
    a back arrow at the left and the note's own actions — the reminder bell and the archive — at
    the right, wearing the note's colour the way the bottom bar does. Ours had no bar at all, so a
    note scrolled past its title had no way back. It stands **above** the element the note scrolls
    in (`.editor .body`: measured 3144px of text in a 250px box on this phone), not inside it, and
    the bottom bar drops its "Close" there because the arrow is the way out — as in the original.
    Measured with the note scrolled: the bar's top stays **0** and the back button stays fully in
    the window. Which surface scrolls is worth measuring rather than assuming: the editor's host
    does **not** (420 of 420), `.body` does.
  - **A popover must stay inside the window.** Every popover carries `collisionPadding={8}` and
    the appearance picker limits itself to `calc(100vw - 32px)`: measured at 360, 393 and 412px,
    the reminder panel lands with an **8px** margin and **0** px off-screen, and the colours — a
    bottom sheet on a phone since 2026-10-15 — span the window to its bottom edge. Before that they sat flush against the edge, and the owner's phone showed the
    picker's "no colour" swatch alone, off the screen.
- **Two breakpoints, named once**: 600px (phone) and 900px (below it the rail is a drawer rather
  than a column), both in `control/state/breakpoints.ts`. A custom property cannot be used in a
  media query and a stylesheet cannot import TypeScript, so the stylesheet spells them out —
  `boundary/styles/breakpoints.test.ts` fails when a `@media` width appears that is not one of them.
Changing any of them needs a new measurement from the original, not an opinion.

### The checklist's own proportions

Measured from the owner's own screenshots of the original, and from ours **the same way** — from a
screenshot of the editor, so both sides are read by one method (`keep-drag-1-resting.webp`
is the original at rest, 623x546, its surface x=15..612):

| | original | ours |
| --- | --- | --- |
| row pitch | 38px | **38** |
| checkbox | 14x14, left edge 26px from the note's edge | **14 @ 26** |
| the row's text | left edge 53px | **53** |
| one nesting level | 25px (nested checkbox at 51) | **25 @ 51** |
| the six-dot handle | ~10px wide, left edge 7px, centre 14.5px left of the checkbox | **~8px @ 6** |

The indent was the worst of them: ours was **49px** a level, because the nested list starts *after*
the parent's label and gap, so the whole of that offset was added to the list's own padding on top of
the indent. Pulling the nested list back by the label and the gap is what makes one level one level.

### What a drag draws, and where the row goes

Measured from the owner's own four screenshots of the original
(`keep-drag-{1-resting,2-grab,3-move,4-drop}.webp`, 623–633px wide; the note's surface is
`x=10..607`, its colour `rgb(123,74,2)`), and from ours the same way — a screenshot of the same state
(`docs/images/notka-drag-carrying.jxl`) plus the drag's own geometry read out of the page while a
row is held:

| | original | ours |
| --- | --- | --- |
| the band's colour | `rgb(31,33,37)`, a neutral that does not take the note's colour | **same** |
| the band's width | the note's own, left edge to right edge (x=10..607) | **same** (measured: 563..1161 on a card at 562..1162) |
| the band's height | the carried row's own box — **84px** around a three-line row | **same** (measured: 86, i.e. 3 x 24 + 2 x 7) |
| ink on the band | `rgb(239,241,245)`, secondary `rgb(200,203,208)` | **same** |
| the carried row's level | drawn at the column of the level it will land at (nested in `2-grab`, top level in `3-move`) | **same** (measured: handle 6..13, checkbox 26..39, text 53 once carried to the top) |
| anything else drawn | nothing — no hole, no copy, no second row | **nothing**: `.drop-gap`/`.drop-shadow`/`.drag-bar`/`.drag-cancel` all absent, and `.dragging-row` count 1 |

Six things were measured and are worth keeping:

- **The band is the row's own box.** The original's band around a three-line row is 84px, which is
  that row's own lines and padding and not a pixel of its neighbours'. A row's box here is its line
  (24px, the editor's line-height) plus **7px** of air above and below, which is the original's own
  7.25: its rows stand 38px apart and its lines inside a multi-line row are 23.5 apart. The band is
  drawn by the component (`.drag-band`), not by the row, because the row is *transformed* to the level
  it will land at and a shadow would travel with it.
- **The band reaches both of the note's edges by measurement.** Ours had a fixed `-22px` shadow, which
  stopped short of the note's left edge: measured in the screenshot, the band began at x=21 where the
  note's edge was at x=11, and the handle's own dark box poked out of it as a **vertical line** — the
  artefact the owner found. The band now takes the card's own rectangle.
- **The carried row keeps its height and its own handle.** Measured while holding: `.dragging-row`
  count 1, its ink `rgb(239, 241, 245)`, the note body the same height as before the drag, and the
  held handle's centre inside the carried row's own box.
- **Nothing about the note is re-laid out while the hand moves.** The rows that give way are drawn
  with `transform`, so the list keeps its height: measured, the toolbar below the note stays at the
  same y (337) for the whole gesture, and the note body stays 176px.
- **What you see is where it lands.** The place is read from the list *closed up over the row in the
  hand* — a frame that does not move for the whole gesture — so one hand position has exactly one
  answer. Measured on a four-row list with the third row carried: painted `alpha,beta,delta,gamma` and
  dropped `alpha,beta,delta,gamma`; carried to the top, painted `gamma,alpha,beta,delta` and dropped
  `gamma,alpha,beta,delta`.
- **The level is 25px a step, half a step to change it.** Tab and Shift-Tab write the row's own
  `depth`, and a second level cannot be written at all: the schema has nowhere to put it (rule 4), so
  three Tabs on one row leave it at level 1 (`data-depth="1"`) and the server never sees a line it
  would refuse.

### The appearance picker

Measured off the original's own picker — the screenshot the owner sent is kept as
`keep-appearance-picker.png` — and read back out of ours by the end-to-end suite, which
fails when any of these drift:

| | original | ours |
| --- | --- | --- |
| a colour swatch | 32px, 36px apart | **32 / 36** |
| a background tile | 40px, 44px apart | **40 / 44** |
| the "no background" tile | 40px — the same as the tiles beside it | **40** (was 32, the colour row's size: the owner's "wyraźnie mniejsza od pozostałych elementów w tej linii") |
| the two groups | separated by a one-pixel line | **1px `--keep-border`** (the owner's "brakuje linii dzielącej kolory tła od teł") |
| the rows | 12px apart | **12** |

Ours, with a colour and a background both chosen, is `docs/images/notka-appearance-picker.jxl` —
the same two rows, the same divider, and a tick on each row.

**A colour and a background are two independent choices**, as the original has them: picking one keeps
the other, and each row carries its own tick. Ours forced them apart ("picking either clears the
other"), so a note with a background had its colour silently reset to none — the owner's "nie mam
możliwości ustawienia jednocześnie tła i obrazka tła notatki jak w google keep". The artwork is
opaque, so it paints over the colour; the colour stays the note's own and returns when the background
is taken away. `space-between`

### What a link preview row sits on

Measured off the owner's screenshots of the original (`keep-link-cards.webp`, and four
more on 2026-10-14: a card and the editor, in both themes), read as flat fills:

| | light | dark | ours |
| --- | --- | --- | --- |
| the note's own surface | `rgb(255,255,255)` | `rgb(32,33,36)` | the note's colour, whatever it is |
| a row's text | `rgb(251,251,251)` | `rgb(49,50,53)` | **the surface + `--keep-link-row`**: 1.6% black / 7.5% white |
| the 56px thumbnail cell | the surface | the surface | not overlaid: the fill starts at 56px |

Only the text part of a row is lightened — in both themes, on the card and in the editor; the
light theme's 8% *white* that ours first used was invisible on a white note.

The rows are **lighter than the note they sit on**, and that is the whole of it: the three rows in
that screenshot all measure `rgb(48,50,52)` over a note of `rgb(31,33,37)`, which is 6.9–7.7% white
per channel. Ours painted them `var(--keep-surface)`, which on a plain note *is* the note's own
colour — the owner's "u nas jest ono takie samo jakie notatki" — and would have been the app's
surface rather than the note's on a coloured one. An overlay fixes both, and 8% is Material's
elevation-3 overlay, within two units of 255 of the measured card.

### Where the checklist sits inside the note

Both read off a screenshot of the same state, **from the note's own left edge** — which is what makes
the two comparable, and what an earlier reading of ours got wrong:

| | original | ours |
| --- | --- | --- |
| the note's title | 16px | **16** |
| the six-dot handle | ink 7..16 | **ink 6..13** |
| the checkbox | 26..39 | **26..39** |
| the row's text | 53 | **53** |
| a nested row | +25 (checkbox at 51) | **+25 (checkbox at 51)** |
| the pin / reminder | pin at the note's top right (x=572..585; the bell is one of the bottom bar's actions, third from the left) | **pin at the top right (565..578), the bell third in the bottom bar** |

The editor's body carries **16px** of padding, so the list adds the remaining **10px** to put the
checkbox 26px from the note's edge. Spelling the 26px into the list itself — which is what the earlier
measurement did — put every row 16px right of the original's and the title in the wrong column, and it
is what the side-by-side showed. The reminder's bell was also in the title's corner; the original keeps
its **pin** there.

### The desktop selection bar's actions

Not measured: the original's selection bar was not captured. Its order follows the Android app's
measured one (pin, reminder, colour — `PhoneSelectionBar.svelte`), then archive and delete, with *Add
label* and *Make a copy* in the ⋮ the way a card's own menu has them. The buttons are the bar's own,
measured 24px glyphs; the pickers are the card's own panels. Replace this with a measurement when one
is taken.

### Collaborators

Read off the Android app's own resources (Keep 5.26.391.03.90, `aapt2 dump resources` and
`dump xmltree` of the installed APK, 2026-10-22) — exact, where a screenshot is an estimate. A card and
the editor show the same people: the note's owner and its collaborators, the reader left out.

| Where | Number | Resource |
| --- | --- | --- |
| Card: circle | 24dp | `browse_meta_data_circle_chip_size` |
| Card: spacing (across / between lines) | 4dp / 8dp | `browse_meta_data_item_spacing` / `browse_meta_data_line_spacing` |
| Card: how many | 3 circles, then a "+N" circle | `browse_sharee_0..2`, `browse_sharee_more` |
| Card: "+N" fill | `#80000000` light, Google Grey 500 dark | `sharee_overflow_background_color` |
| Editor: circle | 40dp | `editor_meta_data_chip_height` |
| Editor: spacing | 8dp, wrapping | `editor_meta_data_flex_layout_spacing` |
| Editor: how many | all | (no overflow view) |

A dp is one CSS px under `width=device-width`, so the tokens (`--keep-avatar-*` in `tokens.css`) scale
with the device's density by themselves. The editor's 40dp is the phone's; the desktop's editor keeps
24px until the web original is measured.

**The editor's title on a phone is 24sp** (`editor_title_text_size`, on `textAppearanceHeadline5`), and
the emulator agrees: the capital Z of "Zakupy" is 59 device px = **17.5dp** tall at 3.375px/dp, which is
a 24px Google Sans face. The 22px it was came from a capital measured at 15.6px off a screenshot.

### The Android app's own resources

Read off the installed APK (`.reference/keep-apk/keep-dimens.txt`, kept locally and never committed —
it is Google's) and checked on the emulator at 412dp, font scale 1.0, both themes (2026-10-22). These
replace numbers that came off the owner's phone, whose display is scaled up by about 7% and whose
system text is set to about 0.73: a device's own scale is the device's to apply — type in `rem`, boxes
in `px`, the APK's `textZoom` from the system's font scale, and on iOS the root's size from Dynamic
Type (`textScale.ts`) — never a number to bake in.

| What | The app's | Where ours is |
| --- | --- | --- |
| Drawer | `drawer_width` 304dp below 400dp of screen, 320dp from there; rows 55dp; the pill 12dp in from either side; a 24dp icon 28dp in, the label at 68dp; rules a 16dp band 28dp in; the `Labels` header 48dp, its heading 28dp in in the glyph colour, `Edit` 24dp from the end; the name 20dp in, capitals 14.5dp | `Sidebar.svelte`, `--keep-drawer-*` |
| Card text | Body2, **14sp** on 20.7dp rows; `colorOnSurface` at **71%** in the light theme, full in the dark (`index_note_description_alpha`); the checkbox 4sp from the text, a level **16dp** | `NoteContent.svelte` |
| Card title | 16sp Google Sans **Medium**, a 24.6dp box | `NoteCard.svelte` |
| Card label chip | 12sp text, 4dp/8dp padding, 8dp corners (`chipShapeRadius`) — 26.7dp tall; `#ebebeb`, 8% white in the dark | `NoteCard.svelte`, `--keep-note-chip` |
| Card metadata | chips and collaborators in one wrapping row, 4dp across, 8dp between lines | `NoteCard.svelte` |
| Editor checklist | *(superseded by the owner's iOS screenshot below)* rows 48dp; the checkbox's ink 60.7dp from the edge and 18dp; the handle centred at 29.9dp; text 16dp after the box; a level **38dp** (`list_item_indent_width`) | `RichText.svelte` |
| Colour and background sheet | headings 24dp in, 20dp under the sheet's top; colours **48dp** circles 14dp apart; backgrounds **64dp** circles 12dp apart from 30dp in; a 1dp outline at rest, a 2dp primary ring when picked (a tick inside for a colour, a 24dp badge on a background's top right); "none" is the plain note's surface; tiles end 34dp above the sheet's edge | `AppearancePicker.svelte` |
| A plain note's sheet | surface-container-low: `#f4f3fa`, `#1a1b21` in the dark; primary `#495d92`/`#b2c5ff`, outline `#757780`/`#8f909a` | `--keep-sheet`, `--keep-phone-primary`, `--keep-phone-outline` |
| Tonal buttons on a background | `keep_editor_button_background_<id>`, both themes | the Google Keep theme's `tonal`/`tonalDark` (`docs/THEMES.md`) |
| Bottom sheet | slides in over **150ms** (`bottom_sheet_slide_duration`) | `Sheet.svelte` |
| The "+" menu | each kind rises 16dp and fades in over 200ms, 35ms after the one below it; fades out over 200ms (`speed_dial_*`) | `ComposeFab.svelte`, `MOTION.speedDialStagger` |
| Card padding / hairline / picked ring | 16dp / 1dp / 3dp | already ours ✓ |
| Note colours' tonal buttons | the eleven `keep_editor_button_background_<colour>` | already ours, to the digit ✓ |

**Pictures**, measured on the emulator with one and then two pictures on a note (2026-10-22): a card's
run edge to edge, **4dp** apart (`images_layout_margin_between_images`); the editor's stand **20dp** in
from the note's sides (`editor_images_view_horizontal_padding`), 4dp apart, right under the 64dp bar,
with the title 12dp below them, and with corners of their own — **24dp** for a picture alone, **8dp**
for each of several, the inner corners too. Ours land on the same pixels (`NoteImages.svelte`, `inset`).

**The editor's bar is 64dp**, its 40dp buttons in its middle (`editor_toolbar`); the 59px it was came
off the scaled-up phone.

### The phone's checklist, from Keep on iOS (2026-10-22)

The owner chose Keep's **iOS** checklist for the phone, from a screenshot of an iPhone (739×1600, i.e.
393pt at 1.88px/pt; the text is 16pt — its capitals 22px tall). Every distance is kept **in em of the
note's text**, so the list follows the reader's text size with the words (Dynamic Type, the APK's
`textZoom`) rather than standing still while they grow:

| What | iOS | em of the text |
| --- | --- | --- |
| Row pitch | 68px = 36pt | **2.25em**: the 1.5em line with 0.375em above and below |
| Checkbox | 34–35px = 18pt | **1.125em**, a 0.125em outline |
| Checkbox to text | 42px = 22pt | **1.375em** |
| Checkbox past the note's text | 66px = 35pt | **2.1875em** (`PHONE_LIST_EM.inset`) |
| Handle | centred 21pt left of the checkbox | **1.3125em**, the glyph 1.5em |
| Vertical alignment | the box's middle is the capitals' middle, to 0.5px | the box centred on the line |
| "+ List item" | the same pitch; the plus centred on the checkboxes' column | 2.25em |

A level keeps the Android app's 38dp (2.375em); the screenshot has no nested row. In px the box and the
line stood still while a scaled text grew or shrank, which is what put the checkbox off its text.

### iOS glass and the reader's text size (2026-10-22)

- **Glass on an iPhone**, from the owner's screenshot of Keep on iOS 26: the back arrow on a **44pt**
  round glass button 16pt from the edge, the pin, the bell and the archive on one **44pt** glass
  capsule 16pt from the other edge (156pt wide, the glyphs 54pt apart), the bottom bar's glyphs bare.
  Ours is the blur (16px, saturated 180%), a light rim along the top and a soft shadow, only where
  `-apple-system-body` is understood (WebKit on Apple's platforms) and only on a phone. The lensing of
  the real Liquid Glass needs an SVG `backdrop-filter`, which WebKit does not draw.
- **The Android app's text size**, checked on the emulator at font scale 1.0 and 1.3: the WebView's
  default `textZoom` is the font scale, and it enlarges the text alone after the layout's lengths are
  fixed — at 1.3 the text was 27px (16 × 1.3 × 1.3, counted twice once the page scaled itself) beside a
  23.4px box. With `textZoom` at 100 and the root scaled by `TextScalePlugin`, the text is 20.8px and
  the box 23.4px — both 1.3 times their size — and the box's middle is the capitals' middle to 0.8px.

## How these numbers are guarded

The desktop numbers are covered by the browser suites in `frontend/e2e`. The **phone** numbers are
not: every other suite runs at 1440x900 and would never notice a phone layout. They have their own
suite, `frontend/e2e/mobile.mjs` (`pnpm run e2e:mobile`): it opens a 412x893 window at 3.375x — and a
420px-tall one, so a note is long enough to scroll under the editor's bar — checks the numbers above,
and runs in Chromium and Firefox (`node e2e/mobile.mjs <url> firefox`).
