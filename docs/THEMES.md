# Background themes

A note's background is an **id** — `groceries`, `food`, `music`, `recipes`, `notes`, `places`,
`travel`, `video`, `celebration` — stored on the note and shared by everyone who can see it. What
that id **looks like** is the reader's background theme. Two people with different themes see the
same note, each in their own pictures.

| Theme | Where | Licence |
| --- | --- | --- |
| **Notka** (built-in) | `frontend/public/backgrounds/<id>-<light\|dark>.svg`, drawn by `tools/generate-backgrounds.py` ([below](#the-built-in-pictures)) | CC0 1.0 |
| **Google Keep** (external) | `themes/google-keep/` — the original's own nine illustrations | © Google LLC, not openly licensed; not shipped with the app or the container |
| your own | uploaded by the administrator | yours |

## Using a theme

Themes belong to the **instance**. The administrator uploads them in *gear → Server settings →
Background themes → Upload theme…* (a `.zip`), removes them there, and marks one as the instance's
**default**. Every account then picks its own in *gear → Settings → Background theme* — one of the
uploaded themes, the built-in one, or *Server default*, which follows whatever the administrator
chooses. The choice is kept on the server, so it follows the account to every browser.

The server checks a theme before it stores it — the rules below — and keeps its pictures in the
database. They are served under `/api/themes/<id>/files/<n>` to anyone — a theme is the instance's
look, not anybody's data, and the sign-in screen wears the default one — with a sandboxing `Content-Security-Policy`, so an SVG's script cannot run even when its url is opened on
its own. Removing a theme sends everyone who used it, and the default, back to the built-in one.

To use the Google Keep theme:

```bash
cd themes/google-keep && zip -r ../google-keep-theme.zip theme.json *.svg logo.png
```

## Making a theme

A theme is a zip with a `theme.json` and the pictures it names. The files may sit at the top of the
archive or in one folder.

```json
{
  "format": 1,
  "id": "watercolour",
  "name": "Watercolour",
  "author": "Ada Lovelace",
  "license": "CC BY 4.0",
  "logo": "logo.svg",
  "highlight": "#fde3cf",
  "highlightDark": "#4a2f22",
  "backgrounds": {
    "food": { "light": "food-light.svg", "dark": "food-dark.svg", "tint": "#fbe4d8", "tintDark": "#352621" },
    "music": { "light": "music.webp" }
  }
}
```

| Field | Rule |
| --- | --- |
| `format` | `1` |
| `name` | required, up to 80 characters |
| `id` | optional; derived from the name when absent. Uploading a theme with the id of one the instance already has replaces it. `notka` is the built-in one's and is refused. |
| `author`, `license` | optional, shown in the list |
| `logo` | optional: the app's logo in the header and the browser tab's icon, in place of Notka's own mark — SVG, PNG, JPEG or WebP, drawn square. The installed app's own icon stays Notka's: a web app manifest cannot change per account. |
| `highlight`, `highlightDark` | optional `#rrggbb`: the sidebar's active entry in the light and the dark colour scheme. The original derives it from its logo (its yellow bulb, a pale yellow `#feefc3` and `#41331c`), so it travels with the logo. The built-in theme's is Notka's sea green (`#c6e9e5`, `#1d3b3a`). The phone's drawer keeps the Android app's own colours. |
| `backgrounds` | any of the nine ids; a background the theme leaves out keeps the built-in picture. An id Notka does not have refuses the theme. A theme must carry at least one background, a logo or a highlight. |
| `light` | the picture for the light theme: SVG, PNG, JPEG or WebP |
| `dark` | the picture for the dark theme; the light one when absent |
| `tint`, `tintDark` | `#rrggbb`: the colour under the picture — what shows before it loads, in the swatch, and under the editor's bottom bar |
| `tonal`, `tonalDark` | optional `#rrggbb`: the fill of the phone editor's round buttons on the picture (the Android app's `keep_editor_button_background_<id>`). Without it the buttons keep the built-in picture's. |

A picture covers the whole note and is cropped to its shape from the **bottom right**
(`background-size: cover; background-position: right bottom`): a wide note shows the picture's lower
band and a tall one its right part, and the desktop editor shows only what is above its bottom bar.
The phone's full-screen editor scales the square to the screen's height and keeps its **right top**,
so the right half is the whole screen and the keyboard covers its lower part. Draw it square and put
what is worth looking at in the lower right, where every crop starts. Keep the **top** one flat
colour, the same as `tint`: on a phone that is under the status bar, which can only take a colour,
and a flat top is what makes the bar look like part of the picture. The ink is fixed per colour scheme
(dark text in the light theme, light text in the dark one), so light pictures must stay light and dark
ones dark.

### The built-in pictures

`tools/generate-backgrounds.py` draws Notka's own nine as flat-colour scenes (1000×1000, about 10–25
KB each), with the composition the original's have: a flat sky in the upper part, the scene along the
bottom, its subject in the lower right and something reaching up the right side for the phone. They
are one family around Notka's sea green (`--keep-brand` `#12a594`, `--keep-brand-fold` `#0b6e63`):
every scene carries those teals — the crate, the bowl, the record, the book's cover, the hills, the
park's trees, the sea, the wheel, the presents — set against a sky of its own, with coral, sand and
butter yellow as the warm accents. The dark variants are the same scenes at dusk.

| Id | Scene | Tint (light / dark) | Tonal (light / dark) |
| --- | --- | --- | --- |
| `groceries` | a teal crate of produce, greens and a paper bag | `#f4ecdb` sand / `#2a3a2b` moss | `#fbf6ea` / `#3b5040` |
| `food` | a teal bowl of noodles, chopsticks, steam | `#fadfd0` peach / `#3a2b29` cocoa | `#fdeee5` / `#523d3a` |
| `music` | a record setting into the sea, notes flying | `#d3ebe8` aqua mist / `#2a2b48` violet dusk | `#e6f5f3` / `#3e4066` |
| `recipes` | an open cookbook, ingredients tossed out of it | `#fcdcc0` apricot / `#4a2c25` terracotta | `#feeadb` / `#653e34` |
| `notes` | misty hills, a pencil drawing the path through them | `#d8e5ea` mist / `#263452` indigo | `#e9f1f4` / `#384a72` |
| `places` | a city park, a skyline and a map pin | `#dcefe6` mint / `#1c3a36` deep green | `#ebf7f1` / `#2a544e` |
| `travel` | a beach with a palm, a sailboat, a plane | `#c8e9f1` sky / `#0f3350` ocean | `#e0f4f8` / `#1f4b70` |
| `video` | a fairground: a ferris wheel and a tent | `#f9e6bf` butter / `#3b2b3f` plum | `#fdf1d9` / `#543e5a` |
| `celebration` | balloons, presents, bunting and fireworks | `#fbd0c3` coral / `#13353a` teal night | `#fde3da` / `#224d54` |

The tint is the picture's own top colour, and the tonal a lighter step of it. They are the fallbacks
in `palette.css`, so a theme that replaces a picture without its own `tint` or `tonal` keeps these.
After changing a scene, run `python3 tools/generate-backgrounds.py frontend/public/backgrounds` and
copy a changed sky colour into `palette.css` and the table above.

Limits: 5 MB a file, 30 MB an archive, both counted as the archive is unpacked. A PNG, JPEG or WebP
must be one by its own bytes, and an SVG must contain an `<svg>` element; a file whose contents do
not match its name is refused.

## How it is applied

`palette.css` draws each background as
`var(--theme-art-<id>-<light|dark>, url('/backgrounds/<id>-<light|dark>.svg'))`, with the tint from
`--theme-tint-<id>` / `--theme-tint-dark-<id>`. `control/state/backgroundThemes.svelte.ts` reads
`GET /api/themes`, sets those properties on the root from the active theme (the urls the server
serves its pictures under) and removes them for the built-in one; `--theme-highlight(-dark)` feed
`--keep-active` in `tokens.css`, and `BrandMark` and the favicon (`App.svelte`) show the theme's logo
when it has one.

The last answer is kept on the device (`localStore`) and applied at start, before the first card is
drawn, then replaced by the server's. Until some answer is applied the root carries no
`data-themes-known` and a background is drawn as its tint alone — otherwise a card drawn before the
theme was known asked for the built-in picture, and then for the theme's. On the server,
`entity/model/Theme.kt` checks `theme.json` and `control/ThemeService.kt` unpacks the archive and
checks the pictures.
