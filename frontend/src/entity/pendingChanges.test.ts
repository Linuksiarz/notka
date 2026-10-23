import { describe, expect, it } from 'vitest';
import type { Label, Note } from './api/types';
import { mergeChanges, touchesText, withChanges } from './pendingChanges';

const LABELS: Label[] = [{ id: 7, name: 'home' } as Label];
const labelFor = (id: number) => LABELS.find((label) => label.id === id);

function note(fields: Partial<Note> = {}): Note {
  return { id: 1, title: 'a', pinned: false, position: 3, labels: [], ...fields } as Note;
}

describe('touchesText', () => {
  it('is true only for the fields that can lose somebody’s text', () => {
    // given / when / then
    expect(touchesText({ title: 'x' })).toBe(true);
    expect(touchesText({ pinned: true, color: 'red' })).toBe(false);
  });
});

describe('mergeChanges', () => {
  it('lets the later write win and drops the versions', () => {
    // given
    const earlier = { title: 'one', color: 'red' as const, version: 4 };
    const later = { title: 'two', version: 4 };

    // when
    const merged = mergeChanges(earlier, later);

    // then
    expect(merged).toEqual({ title: 'two', color: 'red' });
  });
});

describe('withChanges', () => {
  it('takes the "edited by" marker away when the reader writes the note, and not otherwise', () => {
    // given
    const marked = note({ unseenEdit: { user: { id: 2, displayName: 'Bob' } as Note['owner'], at: 5 } });

    // when
    const written = withChanges(marked, { title: 'mine' }, labelFor, 42);
    const recoloured = withChanges(marked, { color: 'red' }, labelFor, 42);

    // then
    expect(written.unseenEdit).toBeUndefined();
    expect(recoloured.unseenEdit).toEqual(marked.unseenEdit);
  });

  it('shows the note as it will be, on top of its section when its pin changed', () => {
    // given
    const before = note();

    // when
    const after = withChanges(before, { title: 'b', pinned: true, labels: [7, 99] }, labelFor, 42);

    // then
    expect(after.title).toBe('b');
    expect(after.pinned).toBe(true);
    expect(after.position).toBe(42);
    expect(after.labels.map((label) => label.id)).toEqual([7]);
  });

  it('leaves the position alone when the pin did not change', () => {
    // given
    const before = note({ pinned: true });

    // when
    const after = withChanges(before, { pinned: true, title: 'c' }, labelFor, 42);

    // then
    expect(after.position).toBe(3);
  });

  it('takes a reminder away for 0', () => {
    // given
    const before = note({ reminderAt: 5, reminderRepeat: 'daily' });

    // when
    const after = withChanges(before, { reminderAt: 0 }, labelFor, 42);

    // then
    expect(after.reminderAt).toBeUndefined();
    expect(after.reminderRepeat).toBeUndefined();
  });
});
