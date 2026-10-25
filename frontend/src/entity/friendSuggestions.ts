import type { FriendGroup, User } from './api/types';

/** What the share dialog offers for what has been typed: a friend, or a group of them. */
export type FriendSuggestion =
  | { kind: 'friend'; user: User }
  | { kind: 'group'; group: FriendGroup; members: User[] };

/** Enough to choose from without the list running off the dialog. */
export const MAX_SUGGESTIONS = 6;

/**
 * The friends and groups that match [query], for a note already shared with [excluded]. A friend
 * matches by any word of the name or by the start of the address; a group by its name. A note can be
 * shared only with an account that has an address, so a friend without one is not offered, and a
 * group is offered while at least one member can still be added. Groups come first: picking one is
 * the bigger step, and there are fewer of them.
 */
export function friendSuggestions(
  query: string,
  friends: User[],
  groups: FriendGroup[],
  excluded: ReadonlySet<number>
): FriendSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const byId = new Map(friends.map((friend) => [friend.id, friend]));
  const addable = (user: User | undefined): user is User =>
    user !== undefined && user.email !== null && !excluded.has(user.id);

  const matchingGroups: FriendSuggestion[] = groups
    .filter((group) => matchesWords(group.name, needle))
    .map((group) => ({ group, members: group.memberIds.map((id) => byId.get(id)).filter(addable) }))
    .filter(({ members }) => members.length > 0)
    .map(({ group, members }) => ({ kind: 'group', group, members }));

  const matchingFriends: FriendSuggestion[] = friends
    .filter(addable)
    .filter((friend) => matchesWords(friend.displayName, needle) || (friend.email ?? '').startsWith(needle))
    .map((user) => ({ kind: 'friend', user }));

  return [...matchingGroups, ...matchingFriends].slice(0, MAX_SUGGESTIONS);
}

function matchesWords(text: string, needle: string): boolean {
  const lower = text.toLowerCase();
  return lower.startsWith(needle) || lower.split(/\s+/).some((word) => word.startsWith(needle));
}
