import { describe, expect, it } from 'vitest';
import type { FriendGroup, User } from './api/types';
import { friendSuggestions, MAX_SUGGESTIONS } from './friendSuggestions';

function user(id: number, displayName: string, email: string | null): User {
  return { id, displayName, email, username: email ? null : 'root', admin: false, avatarAt: null };
}

const bob = user(2, 'Bob Builder', 'bob@example.com');
const cyd = user(3, 'Cyd Charisse', 'cyd@example.com');
const root = user(4, 'Administrator', null);
const family: FriendGroup = { id: 10, name: 'Family', memberIds: [bob.id, cyd.id] };
const admins: FriendGroup = { id: 11, name: 'Admins', memberIds: [root.id] };

describe('friendSuggestions', () => {
  it('matches a word of the name and the start of the address', () => {
    // given
    const friends = [bob, cyd];

    // when
    const byLastName = friendSuggestions('chari', friends, [], new Set());
    const byAddress = friendSuggestions('BOB@', friends, [], new Set());

    // then
    expect(byLastName).toEqual([{ kind: 'friend', user: cyd }]);
    expect(byAddress).toEqual([{ kind: 'friend', user: bob }]);
  });

  it('offers a group first, with only the members that can still be added', () => {
    // given: Bob already has the note
    const excluded = new Set([bob.id]);

    // when
    const found = friendSuggestions('f', [bob, cyd], [family], excluded);

    // then
    expect(found).toEqual([{ kind: 'group', group: family, members: [cyd] }]);
  });

  it('leaves out a friend without an address and a group with nobody left to add', () => {
    // given
    const friends = [bob, root];

    // when
    const found = friendSuggestions('a', friends, [admins], new Set());

    // then
    expect(found).toEqual([]);
  });

  it('says nothing about an empty query and stops at a handful', () => {
    // given
    const many = Array.from({ length: 20 }, (_, index) => user(100 + index, `Sam ${index}`, `sam${index}@x.io`));

    // when
    const empty = friendSuggestions('  ', many, [], new Set());
    const sams = friendSuggestions('sam', many, [], new Set());

    // then
    expect(empty).toEqual([]);
    expect(sams).toHaveLength(MAX_SUGGESTIONS);
  });
});
