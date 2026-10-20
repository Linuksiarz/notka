# Background themes

A note's background is an **id** — `groceries`, `food`, `music`, `recipes`, `notes`, `places`,
`travel`, `video`, `celebration` — stored on the note and shared by everyone who can see it. What
that id **looks like** is the reader's background theme. Two people with different themes see the
same note, each in their own pictures.

| Theme | Where | Licence |
| --- | --- | --- |
| **Notka** (built-in) | `frontend/public/backgrounds/<id>-<light\|dark>.svg`, drawn by `tools/generate-backgrounds.py` | CC0 1.0 |
| **Google Keep** (external) | `themes/google-keep/` — the original's own nine illustrations | © Google LLC, not openly licensed; not shipped with the app or the container |
| your own | uploaded by the administrator | yours |

## Using a theme

Themes belong to the **instance**. The administrator uploads them in *gear → Server settings →
Background themes → Upload theme…* (a `.zip`), removes them there, and marks one as the instance's
**default**. Every account then picks its own in *gear → Settings → Background theme* — one of the
uploaded themes, the built-in one, or *Server default*, which follows whatever the administrator
chooses. The choice is kept on the server, so it follows the account to every browser.

The server checks a theme before it stores it — the rules below — and keeps its pictures in the
database. They are served under `/api/themes/<id>/files/<n>` to signed-in accounts only, with a
sandboxing `Content-Security-Policy`, so an SVG's script cannot run even when its url is opened on
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
| `logo` | optional: the app's logo in the header, in place of Notka's own mark — SVG, PNG, JPEG or WebP, drawn square |
| `highlight`, `highlightDark` | optional `#rrggbb`: the sidebar's active entry in the light and the dark colour scheme. The original derives it from its logo (its yellow bulb, a pale yellow `#feefc3` and `#41331c`), so it travels with the logo. The built-in theme's is Notka's sea green (`#c6e9e5`, `#1d3b3a`). The phone's drawer keeps the Android app's own colours. |
| `backgrounds` | any of the nine ids; a background the theme leaves out keeps the built-in picture. An id Notka does not have refuses the theme. A theme must carry at least one background, a logo or a highlight. |
| `light` | the picture for the light theme: SVG, PNG, JPEG or WebP |
| `dark` | the picture for the dark theme; the light one when absent |
| `tint`, `tintDark` | `#rrggbb`: the colour under the picture — what shows before it loads, in the swatch, and under the editor's bottom bar |

A picture covers the whole note and is cropped to its shape (`background-size: cover`, centred):
draw it square, keep the subject in the lower middle, and leave the upper left quiet, because that
is where the note's text sits. The ink is fixed per colour scheme (dark text in the light theme,
light text in the dark one), so light pictures must stay light and dark ones dark.

Limits: 5 MB a file, 30 MB an archive, both counted as the archive is unpacked. A PNG, JPEG or WebP
must be one by its own bytes, and an SVG must contain an `<svg>` element; a file whose contents do
not match its name is refused.

## How it is applied

`palette.css` draws each background as
`var(--theme-art-<id>-<light|dark>, url('/backgrounds/<id>-<light|dark>.svg'))`, with the tint from
`--theme-tint-<id>` / `--theme-tint-dark-<id>`. `control/state/backgroundThemes.svelte.ts` reads
`GET /api/themes`, sets those properties on the root from the active theme (the urls the server
serves its pictures under) and removes them for the built-in one; `--theme-highlight(-dark)` feed
`--keep-active` in `tokens.css`, and `BrandMark` draws the theme's logo when it has one. On the server,
`entity/model/Theme.kt` checks `theme.json` and `control/ThemeService.kt` unpacks the archive and
checks the pictures.
