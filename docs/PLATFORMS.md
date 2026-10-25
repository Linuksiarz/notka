# Supported platforms

Notka is tested on the browsers below and has no fallbacks for others. The line is drawn by
**JPEG XL**: every profile picture is stored in it (`docs/DATA-MODEL.md`), and Notka does not decode it
itself, so a browser has to draw JPEG XL on its own. In a browser that cannot, the app says at start
that it is tested on the list below and that some features — pictures in particular — may not work
correctly (profile pictures fall back to initials).

The list lives in code as `frontend/src/entity/recommendedBrowsers.ts`; change both together.

## Browsers

| Browser | Minimum version | JPEG XL since |
| --- | --- | --- |
| Waterfox | 6.6 | 6.6.0, its ESR 140 release |
| Firefox | 158 | 158 (October 2026), on without a flag |
| Chromium / Chrome | 155 | 155 (October 2026), on without a flag; one row, because Chrome is Chromium here |
| Safari | 17 | 17 (September 2023) |

**Microsoft Edge does not support JPEG XL** (October 2026), although it is built on Chromium, so it
is not a supported browser. The same goes for other Chromium-based browsers (Samsung Internet, Brave,
Opera) until their own release turns on what Chromium 155 shipped.

## Mobile systems

| System | Minimum | Why |
| --- | --- | --- |
| Android | **12** (API 31), with Chrome or Android System WebView **155** or newer | The Android app (`apk/`) needs Android 12; it, and the browser, draw pages with the system's Chromium, which draws JPEG XL from 155. Firefox 158 for Android works as well. |
| iOS / iPadOS | **17** | Every browser on iOS draws with the system's WebKit, which is Safari's: JPEG XL arrived with Safari 17, which needs iOS 17. |

Installing Notka as a web app (the browser's "Add to Home Screen" / "Install") has the same
requirements as the browser that installs it.
