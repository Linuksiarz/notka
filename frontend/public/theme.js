// Applied before first paint so a dark-theme user never sees a white flash.
try {
  var stored = localStorage.getItem('notka.theme');
  var dark =
    stored === 'dark' ||
    (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    // The system's bar too, before the app takes it over: a dark page under a white status bar is
    // the flash this script exists to prevent.
    var bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute('content', '#202124');
  }
} catch (error) {
  /* localStorage can be unavailable in private mode; the default light theme is fine. */
}
