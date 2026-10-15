/**
 * The two widths the layout changes at, named once.
 *
 * They cannot live in `tokens.css`: a custom property is not allowed in a media query, and a
 * stylesheet cannot import TypeScript. So the stylesheet spells the numbers out and
 * `boundary/styles/breakpoints.test.ts` fails if a `@media` width appears that is not one of these —
 * which is the only way the two sides can stay honest without a build step for custom media.
 */
export const PHONE_MAX_WIDTH = 600;

/** Below this the sidebar becomes an overlay drawer instead of a column. */
export const NARROW_LAYOUT_MAX_WIDTH = 900;
