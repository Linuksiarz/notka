import { describe, expect, it } from 'vitest';
import type { Note } from './api/types';
import { matchesFilter, parseSearchFilter, searchFacets, searchFilterPath } from './search';
import type { SearchFilter } from './search';

function note(overrides: Partial<Note>): Note {
  return {
    id: 1,
    kind: 'TEXT',
    title: '',
    content: { version: 1, blocks: [{ id: 'b1', type: 'paragraph', spans: [] }] },
    color: 'default',
    labels: [],
    ...overrides
  } as Note;
}

describe('search filters', () => {
  it('offers only what some note has, in the page order', () => {
    // given
    const notes = [
      note({ id: 1, kind: 'LIST', color: 'red', labels: [{ id: 7, name: 'home' }] }),
      note({
        id: 2,
        content: { version: 1, blocks: [{ id: 'b', type: 'paragraph', spans: [{ text: 'see https://a.b' }] }] }
      })
    ];

    // when
    const facets = searchFacets(notes);

    // then
    expect(facets).toEqual({ types: ['lists', 'urls'], labelIds: [7], colors: ['default', 'red'] });
  });

  it('matches a note by type, label and colour', () => {
    // given
    const list = note({ kind: 'LIST', color: 'blue', labels: [{ id: 3, name: 'x' }], reminderAt: 5 });

    // when
    const results = [
      matchesFilter(list, { kind: 'type', type: 'lists' }),
      matchesFilter(list, { kind: 'type', type: 'reminders' }),
      matchesFilter(list, { kind: 'type', type: 'urls' }),
      matchesFilter(list, { kind: 'label', labelId: 3 }),
      matchesFilter(list, { kind: 'color', color: 'red' })
    ];

    // then
    expect(results).toEqual([true, true, false, true, false]);
  });

  it('round-trips every filter through its address', () => {
    // given
    const filters: SearchFilter[] = [
      { kind: 'type', type: 'urls' },
      { kind: 'label', labelId: 12 },
      { kind: 'color', color: 'teal' }
    ];

    // when
    const parsed = filters.map((filter) => parseSearchFilter(searchFilterPath(filter)));

    // then
    expect(parsed).toEqual(filters);
    expect(parseSearchFilter('/search/colors/neon')).toBeNull();
  });
});
