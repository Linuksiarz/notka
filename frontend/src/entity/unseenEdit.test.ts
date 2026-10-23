import { describe, expect, it } from 'vitest';
import type { Note, User } from './api/types';
import { seenAsOf } from './unseenEdit';

const BOB = { id: 2, displayName: 'Bob' } as User;

function note(fields: Partial<Note> = {}): Note {
  return { id: 1, title: 'a', ...fields } as Note;
}

describe('seenAsOf', () => {
  it('takes away the marker of an edit the reader has seen', () => {
    // given
    const marked = note({ unseenEdit: { user: BOB, at: 100 } });

    // when
    const seen = seenAsOf(marked, 100);

    // then
    expect(seen.unseenEdit).toBeUndefined();
    expect('unseenEdit' in seen).toBe(false);
    expect(seen.title).toBe('a');
  });

  it('keeps the marker of an edit made after the moment the reader saw', () => {
    // given: somebody wrote again after the note was opened
    const marked = note({ unseenEdit: { user: BOB, at: 200 } });

    // when
    const seen = seenAsOf(marked, 100);

    // then
    expect(seen).toBe(marked);
  });

  it('leaves an unmarked note as it is', () => {
    // given
    const plain = note();

    // when
    const seen = seenAsOf(plain, 100);

    // then
    expect(seen).toBe(plain);
  });
});
