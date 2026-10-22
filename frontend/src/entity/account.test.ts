import { describe, expect, it } from 'vitest';
import { otherPeople } from './account';
import type { User } from './api/types';

const person = (id: number): User => ({ id, email: `${id}@example.com`, username: null, displayName: `P${id}`, admin: false });

describe('otherPeople', () => {
  it('shows the owner the collaborators', () => {
    // given
    const note = { owner: person(1), shares: [{ user: person(2) }, { user: person(3) }] };

    // when
    const people = otherPeople(note, 1);

    // then
    expect(people.map((user) => user.id)).toEqual([2, 3]);
  });

  it('shows a collaborator the owner and the other collaborators, but not themself', () => {
    // given
    const note = { owner: person(1), shares: [{ user: person(2) }, { user: person(3) }] };

    // when
    const people = otherPeople(note, 2);

    // then
    expect(people.map((user) => user.id)).toEqual([1, 3]);
  });

  it('shows nobody on a note that is not shared', () => {
    // given
    const note = { owner: person(1), shares: [] };

    // when
    const people = otherPeople(note, 1);

    // then
    expect(people).toEqual([]);
  });
});
