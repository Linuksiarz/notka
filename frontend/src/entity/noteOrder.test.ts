import { describe, expect, it } from 'vitest';
import type { Note } from './api/types';
import { byPlace, byReminder, bySort } from './noteOrder';

function note(id: number, fields: Partial<Note>): Note {
  return { id, pinned: false, position: 0, reminderAt: null, ...fields } as Note;
}

describe('byPlace', () => {
  it('puts pinned notes first, then the highest position', () => {
    // given
    const notes = [
      note(1, { position: 3 }),
      note(2, { position: 1, pinned: true }),
      note(3, { position: 5 }),
      note(4, { position: 2, pinned: true })
    ];

    // when
    const ordered = [...notes].sort(byPlace).map((item) => item.id);

    // then
    expect(ordered).toEqual([4, 2, 3, 1]);
  });
});

describe('byReminder', () => {
  it('puts the soonest reminder first', () => {
    // given
    const notes = [note(1, { reminderAt: 300 }), note(2, { reminderAt: 100 }), note(3, { reminderAt: 200 })];

    // when
    const ordered = [...notes].sort(byReminder).map((item) => item.id);

    // then
    expect(ordered).toEqual([2, 3, 1]);
  });
});

describe('bySort', () => {
  it('orders by the date asked for, newest first, with pinned notes still leading', () => {
    // given
    const notes = [
      note(1, { createdAt: 100, updatedAt: 900 }),
      note(2, { createdAt: 300, updatedAt: 200 }),
      note(3, { createdAt: 200, updatedAt: 500, pinned: true })
    ];

    // when
    const created = [...notes].sort(bySort('created')).map((item) => item.id);
    const modified = [...notes].sort(bySort('modified')).map((item) => item.id);

    // then
    expect(created).toEqual([3, 2, 1]);
    expect(modified).toEqual([3, 1, 2]);
  });

  it('keeps the custom order the place order', () => {
    // given: no fixtures required

    // when
    const compare = bySort('custom');

    // then
    expect(compare).toBe(byPlace);
  });
});
