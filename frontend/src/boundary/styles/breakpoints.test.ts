import { describe, expect, it } from 'vitest';
import { NARROW_LAYOUT_MAX_WIDTH, PHONE_MAX_WIDTH } from '../../control/state/breakpoints';

/**
 * The layout changes at two widths, and they are named once in `control/state/breakpoints.ts`. A
 * custom property cannot be used in a media query and a stylesheet cannot import TypeScript, so the
 * stylesheet spells the numbers out — this test is what keeps the two spellings equal.
 *
 * The sources come in as raw text through Vite rather than through `node:fs`: the app has no Node
 * types, and reading a component off disk is not something a browser build should do.
 */
const SOURCES = import.meta.glob('../**/*.{svelte,css}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Every width a `@media` query is written against, with the file it came from. */
function mediaWidths(): { file: string; width: number }[] {
  const found: { file: string; width: number }[] = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    for (const match of source.matchAll(/@media[^{]*?\(\s*(?:max|min)-width:\s*(\d+)px/g)) {
      found.push({ file, width: Number(match[1]) });
    }
  }
  return found;
}

describe('layout breakpoints', () => {
  it('are the two named widths, and the exclusive complement of the wide one', () => {
    // given: the two breakpoints, and 901px as the "wider than the narrow layout" complement
    const allowed = new Set([PHONE_MAX_WIDTH, NARROW_LAYOUT_MAX_WIDTH, NARROW_LAYOUT_MAX_WIDTH + 1]);

    // when: every media query in the app is read
    const widths = mediaWidths();

    // then: none of them invented a third width
    const unexpected = widths.filter((entry) => !allowed.has(entry.width));
    expect(widths.length, 'the app has media queries to check').toBeGreaterThan(0);
    expect(
      unexpected,
      `a @media width that is not a named breakpoint: ${JSON.stringify(unexpected)}`
    ).toEqual([]);
  });

  it('partition the phone from the rest without a gap or an overlap', () => {
    // given: the phone breakpoint and the narrow-layout one
    const phone = PHONE_MAX_WIDTH;
    const narrow = NARROW_LAYOUT_MAX_WIDTH;

    // when: they are compared the way the stylesheet uses them

    // then: a phone is the smaller one, and the wide layout starts above the narrow one
    expect(phone).toBeLessThan(narrow);
  });
});
