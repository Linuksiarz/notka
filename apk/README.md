# Notka for Android

An Android app for Notka: a WebView on the reader's own Notka server, built with
[Capacitor](https://capacitorjs.com) 8. It needs Android 12 (API 31) or newer — the releases of the
last five years — and targets API 36.

It is a module of its own, like `backend/` and `frontend/`: it talks to Notka only by loading the
server's pages, and the frontend knows about it only through Capacitor's bridge.

## What it adds over the installed web app

- **The page is drawn under the status bar and the gesture bar**, as the original's notes are: an
  open note's colour and picture reach up behind the clock. The app is edge-to-edge on every version
  (Android 15+ enforces it, `enableEdgeToEdge()` does the same on 12–14), and the page keeps clear of
  the bars by their insets (`--keep-inset-top` / `--keep-inset-bottom` in `frontend/…/tokens.css`).
- **The status bar's icons follow what is under them** (`frontend/src/boundary/systemBar.ts` calls
  `StatusBar.setStyle` where the web app sets `theme-color`).
- The system's Back closes an open note and leaves the app only from where the page cannot go back.

The insets are published by the app itself (`PageInsets.kt`) as the CSS variables Capacitor uses,
`--safe-area-inset-*`, on every WebView version. Capacitor's own `SystemBars` is switched off
(`insetsHandling: "disable"`): it lets the page under the bars only on Android System WebView 140 and
newer, and on an older one leaves the status bar a plain strip of the window's background. The
keyboard is the one inset the page does not lie under: the root view takes its height as padding.

## Choosing the server

Notka is self-hosted, so no address is built in. On the first start the app shows its own page
(`www/index.html`), which asks for the server and checks `GET /api/health` before keeping it.
Capacitor only gives its bridge to the origin its configuration names, so `MainActivity` builds that
configuration at start-up from the stored address (`Instance.kt`), and choosing another server
restarts the activity. Settings → Server → *Change server* (shown only in the app) goes back to the
first page.

When the server does not answer and its service worker has no copy of the app, the same page is
Capacitor's `errorPath`, with *Try again* and *Change server*.

Only `https://` addresses are accepted — plus `http://localhost` in a debug build, for a development
server forwarded with `adb reverse`.

## Building

Needs JDK 21 and the Android SDK (`ANDROID_HOME`, or `android/local.properties` with `sdk.dir`).

```bash
pnpm install
pnpm run build            # android/app/build/outputs/apk/debug/app-debug.apk
pnpm run build:release    # android/app/build/outputs/apk/release/
```

A release is signed when the environment names a keystore — `NOTKA_KEYSTORE`,
`NOTKA_KEYSTORE_PASSWORD`, `NOTKA_KEY_ALIAS`, `NOTKA_KEY_PASSWORD` — and is left unsigned otherwise.
In this environment, prefix Gradle with `GRADLE_USER_HOME=<repo>/.gradle-home` as everywhere else.

`pnpm run sync` (part of both builds) copies `www/` and `capacitor.config.json` into the Android
project and regenerates `capacitor.settings.gradle` and `app/capacitor.build.gradle`. Those two are
Capacitor's and stay Groovy; everything of ours in `android/` is Kotlin.

## Trying it against a local server

```bash
adb reverse tcp:8080 tcp:8080
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Then enter `http://localhost:8080`. A debug build lets Chrome's `chrome://inspect` attach to the
WebView.

## Not yet

- Sharing *into* the app from another app: the web app's `share_target` belongs to an installed PWA,
  and the APK would need an intent filter of its own.
