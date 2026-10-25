/**
 * The browsers Notka is tested on, each from the first version that draws JPEG XL itself — the format
 * every avatar is stored in (`docs/DATA-MODEL.md`). There is no decoder of our own for the others: a
 * browser that cannot draw JPEG XL is told so at start (`BrowserNotice.svelte`) and shows initials.
 *
 * The versions are when JPEG XL became available without a flag: Waterfox 6.6 (its ESR 140 release),
 * Firefox 158 and Chrome 155 (October 2026; Chromium is Chrome's own code, so the same number), and
 * Safari 17 (September 2023). `docs/PLATFORMS.md` is the same list for people, with the minimum
 * Android and iOS versions; change both together.
 */
export interface RecommendedBrowser {
  /** One row can name several browsers that are one and the same here: Chromium and Chrome. */
  names: readonly { name: string; url: string }[];
  minVersion: string;
}

export const RECOMMENDED_BROWSERS: readonly RecommendedBrowser[] = [
  { names: [{ name: 'Waterfox', url: 'https://www.waterfox.com/' }], minVersion: '6.6' },
  { names: [{ name: 'Firefox', url: 'https://www.mozilla.org/firefox/' }], minVersion: '158' },
  {
    names: [
      { name: 'Chromium', url: 'https://www.chromium.org/getting-involved/download-chromium/' },
      { name: 'Chrome', url: 'https://www.google.com/chrome/' }
    ],
    minVersion: '155'
  },
  { names: [{ name: 'Safari', url: 'https://www.apple.com/safari/' }], minVersion: '17' }
];
