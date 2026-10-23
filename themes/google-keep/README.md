# Google Keep background theme

The nine background illustrations of Google Keep, light and dark, its logo, and the pale yellow its
sidebar marks the active entry with (derived from that logo), as a Notka background theme.

**This artwork is © Google LLC. It is not openly licensed and is not covered by Notka's AGPL-3.0
licence.** It lives outside the app on purpose: Notka ships its own, CC0 artwork as the built-in
theme, and this folder exists only for people who want the original's look on their own instance.
Using it is your decision and your responsibility; do not redistribute it.

## Using it

1. Pack the folder's contents (not the folder itself) into a zip:

   ```bash
   cd themes/google-keep && zip -r ../google-keep-theme.zip theme.json *.svg logo.png
   ```

2. In Notka, as the administrator: **gear → Server settings → Background themes → Upload theme…**, pick the zip, and make it the default or let everyone pick it in their own Settings.

The theme is kept on the server, and every account can pick it in its own Settings. See
`docs/THEMES.md` for the format.

## Getting the artwork

The pictures are **not in this repository** (`.gitignore`): they are Google's, and committing them would be
redistributing them. Save the nine backgrounds, light and dark, from Google Keep's own background
picker into this folder under the names `theme.json` lists (`groceries-light.svg`, `groceries-dark.svg`,
…), and the logo the original's header shows as `logo.png`:

```bash
curl -o logo.png https://www.gstatic.com/images/branding/productlogos/keep_2026/v2/web-48dp/logo_keep_2026_color_2x_web_48dp.png
```

Then pack them as above.

## Its colours

`theme.json`'s `tint`/`tintDark` are each picture's own top colour, read off the SVGs, because on a
phone the status bar takes the tint and has to look like the top of the picture. `tonal`/`tonalDark`
are the Android app's `keep_editor_button_background_<id>`, read off its APK (`docs/METRICS.md`).
