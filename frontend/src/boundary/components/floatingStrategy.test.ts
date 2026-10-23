import { describe, expect, it } from 'vitest';

/**
 * **Every menu and popover floats `fixed`.** bits-ui places them `absolute` in the document by
 * default. Opened near the bottom of the page, the content is first laid out below its trigger, which
 * makes the page longer; the browser scrolls to bring the focused menu into view, the whole screen
 * jumps, the menu then flips above the trigger, and the button the reader was still holding came up
 * over one of its items and picked it. A `fixed` layer takes no room in the document and cannot be
 * scrolled to. bits-ui has no app-wide default for it, so each content says so, and this test is what
 * keeps a new one from forgetting.
 *
 * The sources come in as raw text through Vite, as in `breakpoints.test.ts`.
 */
const SOURCES = import.meta.glob('../**/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

describe('floating menus and popovers', () => {
  it('are all positioned fixed', () => {
    // given: every bits-ui menu and popover content opened in a component
    const contents = Object.entries(SOURCES).flatMap(([file, source]) =>
      [...source.matchAll(/<(DropdownMenu|Popover)\.Content\b[^>]*>/g)].map((match) => ({ file, tag: match[0] }))
    );

    // when
    const absolute = contents.filter((content) => !content.tag.includes('strategy="fixed"'));

    // then
    expect(contents.length, 'the app has menus to check').toBeGreaterThan(0);
    expect(absolute.map((content) => content.file)).toEqual([]);
  });
});
